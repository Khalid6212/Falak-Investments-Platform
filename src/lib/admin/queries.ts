import "server-only";
import { db } from "@/lib/db";
import { requireFalakRoleWithDepartmentScope } from "@/lib/auth/department-scope";
import { REVENUE_METRIC_KEYS, sumRevenueMetricValues } from "@/lib/reporting/revenue-metrics";
import type {
  AdminPortfolioData,
  AdminCompanyDTO,
  AdminCompanyPeriodData,
  AdminPeriodOption,
} from "./dto";

// The shared formatDate()/StatusBadge <time> helpers across this app
// expect a bare "YYYY-MM-DD" string (matching the mock fixtures' own
// convention) -- never a full ISO timestamp. Time-of-day is discarded here
// for the same reason the mock data never had it.
function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * One server-side fetch for the whole /admin overview page. Requires at
 * least FALAK_OPERATIONS (FALAK_ADMIN also satisfies it, per
 * requireFalakRole's existing superset semantics) -- this function is the
 * page's read gate; individual mutations in actions.ts each re-check
 * FALAK_ADMIN independently, never trusting that this call already ran.
 */
export async function getAdminPortfolioData(): Promise<AdminPortfolioData> {
  // Operations/Management are department-scoped (unlike Admin): each
  // of companies/vehicles/investors is filtered independently by the
  // caller's own department, and the join table (ownershipPositions)
  // and cycles follow the company's department so no out-of-department
  // row leaks in through a relation.
  const scope = await requireFalakRoleWithDepartmentScope("FALAK_OPERATIONS");
  const deptWhere = scope.departments ? { department: { in: scope.departments } } : {};
  // Archived records still show here (marked as such); deleted ones never do.
  const liveWhere = { ...deptWhere, deletedAt: null };

  const [companies, vehicles, investors, ownershipPositions, cycles, templates] = await Promise.all([
    db.company.findMany({ where: liveWhere, orderBy: { nameEn: "asc" } }),
    db.vehicle.findMany({ where: liveWhere, orderBy: { nameEn: "asc" } }),
    db.investor.findMany({ where: liveWhere, orderBy: { nameEn: "asc" } }),
    db.ownershipPosition.findMany({
      where: { holderType: "VEHICLE", company: liveWhere, vehicle: liveWhere },
      select: { companyId: true, vehicleId: true },
    }),
    db.reportingCycle.findMany({
      where: { company: liveWhere },
      select: {
        id: true,
        companyId: true,
        periodLabel: true,
        periodStart: true,
        periodEnd: true,
        currentDeadline: true,
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
    }),
    db.reportingTemplate.findMany({ orderBy: { nameEn: "asc" } }),
  ]);

  const periodMap = new Map<string, AdminPeriodOption>();
  for (const cycle of cycles) {
    if (!periodMap.has(cycle.periodLabel)) {
      periodMap.set(cycle.periodLabel, {
        key: cycle.periodLabel,
        label: cycle.periodLabel,
        periodStart: toDateOnly(cycle.periodStart),
        periodEnd: toDateOnly(cycle.periodEnd),
      });
    }
  }
  const periods = [...periodMap.values()].sort((a, b) => a.periodStart.localeCompare(b.periodStart));

  const companyDTOs: AdminCompanyDTO[] = companies.map((company) => {
    const periodsData: Record<string, AdminCompanyPeriodData> = {};
    for (const period of periods) {
      periodsData[period.key] = {
        status: "draft",
        revenue: null,
        lastUpdated: null,
        cycleId: null,
        submissionId: null,
        currentDeadline: null,
      };
    }
    for (const cycle of cycles) {
      if (cycle.companyId !== company.id) continue;
      const submission = cycle.submission;
      const revenue = submission ? sumRevenueMetricValues(submission.metricValues) : null;

      periodsData[cycle.periodLabel] = {
        status: submission?.status ?? "draft",
        revenue,
        lastUpdated: submission ? toDateOnly(submission.updatedAt) : null,
        cycleId: cycle.id,
        submissionId: submission?.id ?? null,
        currentDeadline: toDateOnly(cycle.currentDeadline),
      };
    }

    return {
      id: company.id,
      updatedAt: company.updatedAt.toISOString(),
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
      archivedAt: company.archivedAt?.toISOString() ?? null,
      periods: periodsData,
    };
  });

  return {
    companies: companyDTOs,
    vehicles: vehicles.map((v) => ({
      id: v.id,
      updatedAt: v.updatedAt.toISOString(),
      slug: v.slug,
      nameEn: v.nameEn,
      nameAr: v.nameAr,
      type: v.type,
      currency: v.currency,
      archivedAt: v.archivedAt?.toISOString() ?? null,
    })),
    investors: investors.map((i) => ({
      id: i.id,
      updatedAt: i.updatedAt.toISOString(),
      nameEn: i.nameEn,
      nameAr: i.nameAr,
      type: i.type,
      archivedAt: i.archivedAt?.toISOString() ?? null,
    })),
    ownershipLinks: ownershipPositions
      .filter((p): p is typeof p & { vehicleId: string } => p.vehicleId !== null)
      .map((p) => ({ vehicleId: p.vehicleId, companyId: p.companyId })),
    periods,
    templates: templates.map((t) => ({
      id: t.id,
      updatedAt: t.updatedAt.toISOString(),
      nameEn: t.nameEn,
      nameAr: t.nameAr,
      isActive: t.isActive,
      collectFinancialStatements: t.collectFinancialStatements,
    })),
  };
}
