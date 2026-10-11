import "server-only";
import { db } from "@/lib/db";
import { requireCurrentUser, requireCompanyMembership } from "@/lib/auth/authorization";
import { requireFalakRoleWithDepartmentScope } from "@/lib/auth/department-scope";
import { ForbiddenError } from "@/lib/auth/authorization-errors";
import type { Department } from "@/generated/prisma/client";
import { REVENUE_METRIC_KEYS, sumRevenueMetricValues } from "@/lib/reporting/revenue-metrics";
import { fetchSubmissionMetricFields } from "@/lib/reporting/metrics";
import { getPortfolioBenchmarks } from "@/lib/admin/benchmarking";
import type {
  CompanyReportData,
  CompanyReportDTO,
  CompanyReportPeriodData,
  CompanyReportPeriodOption,
  CompanyReportVehicleDTO,
  CompanyReportViewerRole,
  CompanyValuationPointDTO,
  CompanyInvestmentDTO,
} from "./dto";

function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Falak staff (any company) OR that one company's own member (their own
 * company only) -- nothing else. No other page in this codebase needs this
 * OR-composition yet, so it stays local/private here rather than becoming
 * a generic export on authorization.ts.
 */
async function requireCompanyReportViewer(
  companyId: string,
  companyDepartment: Department
): Promise<{ viewerRole: CompanyReportViewerRole }> {
  try {
    const scope = await requireFalakRoleWithDepartmentScope("FALAK_OPERATIONS");
    if (scope.departments && !scope.departments.includes(companyDepartment)) {
      // Out-of-department staff falls through to the company-membership
      // check below, same as someone with no Falak role at all -- they
      // are never that company's own member either, so it ends in the
      // same ForbiddenError, collapsed by the caller into the same
      // "unknown slug" null the page already returns for a non-member.
      throw new ForbiddenError();
    }
    return { viewerRole: "FALAK_STAFF" };
  } catch (error) {
    if (!(error instanceof ForbiddenError)) throw error;
  }
  await requireCompanyMembership(companyId, "MEMBER");
  return { viewerRole: "COMPANY_MEMBER" };
}

/**
 * One company's full report: every reporting period it has a real cycle
 * for, each period's live submission status/revenue (never just the
 * published snapshot -- a company member needs to track their own
 * in-progress draft, same as Falak staff does), and whichever periods
 * have a currently-published (isSuperseded: false) ReportVersion's
 * narrative sections attached.
 *
 * Returns null for an unknown slug -- the caller (the page) must call
 * notFound() for that AND for a ForbiddenError alike, never a redirect
 * for one and a 404 for the other, so this page never reveals which real
 * company slugs exist to a visitor who isn't authorized to see them (same
 * discipline as /submit/[slug]).
 */
export async function getCompanyReportData(slug: string): Promise<CompanyReportData | null> {
  await requireCurrentUser();

  const company = await db.company.findFirst({
    where: { slug, deletedAt: null },
    select: {
      id: true,
      slug: true,
      nameEn: true,
      nameAr: true,
      sectorEn: true,
      sectorAr: true,
      customerModel: true,
      revenueModels: true,
      currency: true,
      entryStage: true,
      currentStage: true,
      founderName: true,
      founderEmail: true,
      founderPhone: true,
      hqCity: true,
      hqCountry: true,
      archivedAt: true,
      department: true,
      cycles: {
        select: {
          id: true,
          templateId: true,
          periodLabel: true,
          periodStart: true,
          periodEnd: true,
          currentDeadline: true,
          template: { select: { nameEn: true, nameAr: true } },
          submission: {
            select: {
              id: true,
              status: true,
              updatedAt: true,
              metricValues: {
                where: { metricDefinition: { key: { in: REVENUE_METRIC_KEYS } } },
                select: { metricDefinition: { select: { key: true } }, numericValue: true, isNa: true },
              },
            },
          },
        },
      },
      reports: {
        where: { scope: "COMPANY" },
        select: {
          periodStart: true,
          periodEnd: true,
          versions: {
            where: { isSuperseded: false },
            select: { narratives: { select: { kind: true, textEn: true, textAr: true } } },
          },
        },
      },
      ownershipPositions: {
        where: { holderType: "VEHICLE", vehicle: { archivedAt: null } },
        select: {
          vehicle: {
            select: { id: true, slug: true, nameEn: true, nameAr: true, type: true, currency: true },
          },
          agreements: {
            where: { status: { in: ["Active", "Superseded"] } },
            orderBy: { signedDate: "asc" },
            select: { signedDate: true, investedAmount: true, currency: true, ownershipPct: true },
          },
        },
      },
      valuations: {
        orderBy: { asOfDate: "asc" },
        select: { asOfDate: true, valuationAmount: true, valuationType: true },
      },
    },
  });

  if (!company) return null;

  const { viewerRole } = await requireCompanyReportViewer(company.id, company.department);

  const periods: CompanyReportPeriodOption[] = company.cycles
    .map((cycle) => ({
      key: cycle.periodLabel,
      label: cycle.periodLabel,
      periodStart: toDateOnly(cycle.periodStart),
      periodEnd: toDateOnly(cycle.periodEnd),
    }))
    .sort((a, b) => a.periodStart.localeCompare(b.periodStart));

  const periodsData: Record<string, CompanyReportPeriodData> = {};
  await Promise.all(
    company.cycles.map(async (cycle) => {
      const submission = cycle.submission;
      const revenue = submission ? sumRevenueMetricValues(submission.metricValues) : null;
      const metrics = submission ? await fetchSubmissionMetricFields(db, submission.id, cycle.templateId) : [];

      // Falak-staff-only, same gate as valuations below -- a company
      // member never sees this. getPortfolioBenchmarks re-verifies
      // FALAK_OPERATIONS itself; calling it when viewerRole is already
      // known to be FALAK_STAFF is always a no-op re-confirmation, never
      // a surprise ForbiddenError.
      const benchmarks =
        viewerRole === "FALAK_STAFF"
          ? (await getPortfolioBenchmarks(cycle.periodLabel)).find((b) => b.companyId === company.id)?.metrics ?? []
          : [];

      const matchingReport = company.reports.find(
        (r) => toDateOnly(r.periodStart) === toDateOnly(cycle.periodStart) && toDateOnly(r.periodEnd) === toDateOnly(cycle.periodEnd)
      );

      periodsData[cycle.periodLabel] = {
        status: submission?.status ?? "draft",
        revenue,
        lastUpdated: submission ? toDateOnly(submission.updatedAt) : null,
        cycleId: cycle.id,
        submissionId: submission?.id ?? null,
        currentDeadline: toDateOnly(cycle.currentDeadline),
        narratives: matchingReport?.versions[0]?.narratives ?? [],
        templateNameEn: cycle.template.nameEn,
        templateNameAr: cycle.template.nameAr,
        isPublished: Boolean(matchingReport?.versions[0]),
        benchmarks,
        metrics,
      };
    })
  );

  const linkedVehicles: CompanyReportVehicleDTO[] = company.ownershipPositions
    .filter((p): p is typeof p & { vehicle: NonNullable<(typeof p)["vehicle"]> } => p.vehicle !== null)
    .map((p) => p.vehicle);

  const companyDTO: CompanyReportDTO = {
    id: company.id,
    slug: company.slug,
    nameEn: company.nameEn,
    nameAr: company.nameAr,
    sectorEn: company.sectorEn,
    sectorAr: company.sectorAr,
    customerModel: company.customerModel,
    revenueModels: company.revenueModels,
    currency: company.currency,
    entryStage: company.entryStage,
    currentStage: company.currentStage,
    founderName: company.founderName ?? null,
    founderEmail: company.founderEmail ?? null,
    founderPhone: company.founderPhone ?? null,
    hqCity: company.hqCity ?? null,
    hqCountry: company.hqCountry ?? null,
    department: company.department,
    archivedAt: company.archivedAt?.toISOString() ?? null,
    periods: periodsData,
  };

  const valuations: CompanyValuationPointDTO[] = company.valuations.map((v) => ({
    asOfDate: toDateOnly(v.asOfDate),
    amount: v.valuationAmount.toNumber(),
    valuationType: v.valuationType,
  }));

  // Investment terms are a fund matter: Falak staff only, like valuations.
  const investments: CompanyInvestmentDTO[] =
    viewerRole === "FALAK_STAFF"
      ? company.ownershipPositions.flatMap((p) =>
          p.vehicle
            ? (p.agreements ?? []).map((a) => ({
                vehicleId: p.vehicle!.id,
                vehicleSlug: p.vehicle!.slug,
                vehicleNameEn: p.vehicle!.nameEn,
                vehicleNameAr: p.vehicle!.nameAr,
                signedDate: toDateOnly(a.signedDate),
                investedAmount: a.investedAmount?.toNumber() ?? null,
                currency: a.currency ?? null,
                ownershipPct: a.ownershipPct?.toNumber() ?? null,
              }))
            : []
        )
      : [];

  return { company: companyDTO, periods, linkedVehicles, viewerRole, valuations, investments };
}
