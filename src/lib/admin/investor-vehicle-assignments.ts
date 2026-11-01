import "server-only";
import { db } from "@/lib/db";
import { requireFalakRoleWithDepartmentScope } from "@/lib/auth/department-scope";
import { positionContributions, sumInDisplay } from "@/lib/vehicle/cap-table-compute";
import type { Currency, ExposureScope } from "@/generated/prisma/client";

export interface InvestorVehicleAssignmentRow {
  id: string;
  investorId: string;
  investorNameEn: string;
  investorNameAr: string;
  vehicleId: string;
  vehicleNameEn: string;
  vehicleNameAr: string;
  currency: Currency;
  commitmentAmount: number | null;
  ownershipPct: number | null;
  effectiveFrom: string;
  exposureScope: ExposureScope;
  /** Startups with an active startup-level exposure under this position. */
  exposedStartupCount: number;
}

function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Falak-staff-only. Every currently-Active InvestorVehiclePosition, for
 * the "Investor Assignment to Vehicle" manage page's own listing --
 * this IS the assignment that makes resolveInvestorExposure
 * (src/lib/reporting/publish-workflow.ts) grant that investor access
 * to, and email them, every published report for a startup this
 * vehicle holds. Exited/WrittenOff positions are excluded: they're
 * history, not a current assignment.
 */
export async function getInvestorVehicleAssignments(): Promise<InvestorVehicleAssignmentRow[]> {
  const scope = await requireFalakRoleWithDepartmentScope("FALAK_OPERATIONS");
  const deptWhere = scope.departments ? { department: { in: scope.departments } } : {};

  const positions = await db.investorVehiclePosition.findMany({
    where: {
      status: "Active",
      investor: { archivedAt: null, ...deptWhere },
      vehicle: { archivedAt: null, ...deptWhere },
    },
    orderBy: { effectiveFrom: "desc" },
    select: {
      id: true,
      currency: true,
      commitmentAmount: true,
      ownershipPct: true,
      effectiveFrom: true,
      exposureScope: true,
      startupExposures: { where: { status: "Active" }, select: { investedAmount: true, currency: true } },
      investor: { select: { id: true, nameEn: true, nameAr: true } },
      vehicle: { select: { id: true, nameEn: true, nameAr: true } },
    },
  });

  // Contribution and ownership as the vehicle's cap table shows them.
  const contributedUsd = new Map<string, number>();
  for (const p of positions) {
    contributedUsd.set(p.vehicle.id, (contributedUsd.get(p.vehicle.id) ?? 0) + sumInDisplay(positionContributions(p), "USD"));
  }

  return positions.map((p) => {
    const contributions = positionContributions(p);
    const vehicleTotal = contributedUsd.get(p.vehicle.id) ?? 0;
    return {
      id: p.id,
      investorId: p.investor.id,
      investorNameEn: p.investor.nameEn,
      investorNameAr: p.investor.nameAr,
      vehicleId: p.vehicle.id,
      vehicleNameEn: p.vehicle.nameEn,
      vehicleNameAr: p.vehicle.nameAr,
      currency: p.currency,
      commitmentAmount: contributions.length > 0 ? sumInDisplay(contributions, p.currency) : null,
      ownershipPct: vehicleTotal > 0 ? sumInDisplay(contributions, "USD") / vehicleTotal : (p.ownershipPct?.toNumber() ?? null),
      effectiveFrom: toDateOnly(p.effectiveFrom),
      exposureScope: p.exposureScope,
      exposedStartupCount: p.startupExposures.length,
    };
  });
}
