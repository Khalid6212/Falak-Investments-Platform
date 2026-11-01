import "server-only";
import { db } from "@/lib/db";
import { requireFalakRoleWithDepartmentScope } from "@/lib/auth/department-scope";
import type { Currency, Department } from "@/generated/prisma/client";

// Draft agreements haven't moved money; Terminated ones had their
// capital returned/written off outside this ledger -- same convention
// as src/lib/admin/portfolio-returns.ts.
const INVESTED_STATUSES = ["Active", "Superseded"] as const;

export interface RawCompany {
  id: string;
  nameEn: string;
  nameAr: string;
  slug: string;
  department: Department;
}

export interface RawVehicle {
  id: string;
  nameEn: string;
  nameAr: string;
  slug: string;
  vintageYear: number | null;
}

export interface RawOwnershipPosition {
  id: string;
  companyId: string;
  vehicleId: string | null;
}

export interface RawAgreement {
  id: string;
  ownershipPositionId: string;
  investedAmount: number;
  currency: Currency;
  signedDate: string;
}

export interface RawValuationSnapshot {
  companyId: string;
  asOfDate: string;
  amount: number;
  currency: Currency;
}

export interface RawNavSnapshot {
  vehicleId: string;
  asOfDate: string;
  amount: number;
  currency: Currency;
}

export interface RawDistribution {
  ownershipPositionId: string;
  amount: number;
  currency: Currency;
}

export interface RawInvestorVehiclePosition {
  vehicleId: string;
  investorId: string;
}

export interface RawReportingPeriod {
  companyId: string;
  periodLabel: string;
  periodStart: string;
  submitted: boolean;
  audited: boolean;
}

export interface PortfolioOverviewRaw {
  asOfYear: number;
  companies: RawCompany[];
  vehicles: RawVehicle[];
  ownershipPositions: RawOwnershipPosition[];
  agreements: RawAgreement[];
  companyValuations: RawValuationSnapshot[];
  vehicleNavs: RawNavSnapshot[];
  distributions: RawDistribution[];
  investorVehiclePositions: RawInvestorVehiclePosition[];
  reportingPeriods: RawReportingPeriod[];
}

function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Falak-staff-only. One wide fetch of every raw row the new portfolio
 * overview dashboard needs -- deliberately returns raw, per-currency,
 * per-row data rather than pre-aggregated totals, so the pure compute
 * layer (portfolio-overview-compute.ts) can re-aggregate instantly on
 * the client when the user flips the USD/SAR display toggle, with no
 * server round-trip. Archived companies/vehicles are excluded
 * entirely -- this dashboard shows the live portfolio, not history of
 * exited positions (a company's historical data stops contributing to
 * every series the moment it's archived, same as every other admin
 * dashboard panel in this codebase).
 */
export async function getPortfolioOverviewData(): Promise<PortfolioOverviewRaw> {
  // FALAK_MANAGEMENT floor, not FALAK_OPERATIONS -- an Investment
  // Professional never sees this page at all. Management itself is
  // department-scoped (unlike Admin): the dashboard still only covers
  // Management's own department's companies/vehicles, never the whole
  // portfolio.
  const scope = await requireFalakRoleWithDepartmentScope("FALAK_MANAGEMENT");
  const companyDeptWhere = scope.departments ? { department: { in: scope.departments } } : {};
  const vehicleDeptWhere = scope.departments ? { department: { in: scope.departments } } : {};

  const [
    companies,
    vehicles,
    ownershipPositions,
    agreements,
    companyValuations,
    vehicleNavs,
    cashFlows,
    investorVehiclePositions,
    reportingCycles,
  ] = await Promise.all([
    db.company.findMany({
      where: { archivedAt: null, ...companyDeptWhere },
      select: { id: true, nameEn: true, nameAr: true, slug: true, department: true },
    }),
    db.vehicle.findMany({
      where: { archivedAt: null, ...vehicleDeptWhere },
      select: { id: true, nameEn: true, nameAr: true, slug: true, vintageYear: true },
    }),
    db.ownershipPosition.findMany({
      where: { company: { archivedAt: null, ...companyDeptWhere } },
      select: { id: true, companyId: true, vehicleId: true },
    }),
    db.investmentAgreement.findMany({
      where: {
        status: { in: [...INVESTED_STATUSES] },
        ownershipPosition: { company: { archivedAt: null, ...companyDeptWhere } },
      },
      select: { id: true, ownershipPositionId: true, investedAmount: true, currency: true, signedDate: true },
    }),
    db.companyValuationSnapshot.findMany({
      where: { company: { archivedAt: null, ...companyDeptWhere } },
      select: { companyId: true, asOfDate: true, valuationAmount: true, currency: true },
    }),
    db.vehicleNavSnapshot.findMany({
      where: { vehicle: { archivedAt: null, ...vehicleDeptWhere } },
      select: { vehicleId: true, asOfDate: true, navAmount: true, currency: true },
    }),
    db.agreementCashFlow.findMany({
      where: {
        type: "Distribution",
        agreement: { ownershipPosition: { company: { archivedAt: null, ...companyDeptWhere } } },
      },
      select: { amount: true, currency: true, agreement: { select: { ownershipPositionId: true } } },
    }),
    db.investorVehiclePosition.findMany({
      where: { status: "Active", vehicle: { archivedAt: null, ...vehicleDeptWhere } },
      select: { vehicleId: true, investorId: true },
    }),
    db.reportingCycle.findMany({
      where: { archivedAt: null, company: { archivedAt: null, ...companyDeptWhere } },
      select: {
        companyId: true,
        periodLabel: true,
        periodStart: true,
        submission: { select: { status: true, attachments: { select: { kind: true } } } },
      },
    }),
  ]);

  return {
    asOfYear: new Date().getFullYear(),
    companies: companies.map((c) => ({ id: c.id, nameEn: c.nameEn, nameAr: c.nameAr, slug: c.slug, department: c.department })),
    vehicles: vehicles.map((v) => ({ id: v.id, nameEn: v.nameEn, nameAr: v.nameAr, slug: v.slug, vintageYear: v.vintageYear })),
    ownershipPositions: ownershipPositions.map((p) => ({ id: p.id, companyId: p.companyId, vehicleId: p.vehicleId })),
    agreements: agreements
      .filter((a) => a.investedAmount !== null && a.currency !== null)
      .map((a) => ({
        id: a.id,
        ownershipPositionId: a.ownershipPositionId,
        investedAmount: a.investedAmount!.toNumber(),
        currency: a.currency!,
        signedDate: toDateOnly(a.signedDate),
      })),
    companyValuations: companyValuations.map((v) => ({
      companyId: v.companyId,
      asOfDate: toDateOnly(v.asOfDate),
      amount: v.valuationAmount.toNumber(),
      currency: v.currency,
    })),
    vehicleNavs: vehicleNavs.map((n) => ({
      vehicleId: n.vehicleId,
      asOfDate: toDateOnly(n.asOfDate),
      amount: n.navAmount.toNumber(),
      currency: n.currency,
    })),
    distributions: cashFlows.map((cf) => ({
      ownershipPositionId: cf.agreement.ownershipPositionId,
      amount: cf.amount.toNumber(),
      currency: cf.currency,
    })),
    investorVehiclePositions: investorVehiclePositions.map((p) => ({ vehicleId: p.vehicleId, investorId: p.investorId })),
    reportingPeriods: reportingCycles.map((c) => ({
      companyId: c.companyId,
      periodLabel: c.periodLabel,
      periodStart: toDateOnly(c.periodStart),
      submitted: c.submission !== null && c.submission.status !== "draft",
      audited: c.submission?.attachments.some((a) => a.kind === "AuditedFinancials") ?? false,
    })),
  };
}
