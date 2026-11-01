import "server-only";
import { db } from "@/lib/db";
import { requireFalakRoleWithDepartmentScope } from "@/lib/auth/department-scope";
import type { CycleStatus, SubmissionStatus } from "@/generated/prisma/client";

export interface ReportingRequestVehicleRef {
  id: string;
  slug: string;
  nameEn: string;
  nameAr: string;
}

export interface ReportingRequestDistributionSummary {
  total: number;
  sent: number;
  pending: number;
  failed: number;
}

export interface ReportingRequestRow {
  cycleId: string;
  companyId: string;
  companySlug: string;
  companyNameEn: string;
  companyNameAr: string;
  vehicles: ReportingRequestVehicleRef[];
  templateNameEn: string;
  templateNameAr: string;
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  currentDeadline: string;
  cycleStatus: CycleStatus;
  requestedAt: string;
  submissionId: string | null;
  submissionStatus: SubmissionStatus | null;
  reportVersionId: string | null;
  isPublished: boolean;
  distribution: ReportingRequestDistributionSummary | null;
}

function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function reportKey(companyId: string, periodStart: Date, periodEnd: Date): string {
  return `${companyId}|${periodStart.toISOString()}|${periodEnd.toISOString()}`;
}

/**
 * Falak-staff-only. One row per ReportingCycle ever opened for a
 * non-archived company -- this IS the "log of all reports being
 * requested" the Reports Review and Approval page and the vehicle
 * page's own reporting section both need: a cycle's mere existence is
 * the request, so there is no separate "request" table to maintain.
 * Each row also carries whether a report was ever actually published
 * for that exact (company, periodStart, periodEnd) and, if so, a
 * sent/pending/failed tally across its investor distributions.
 *
 * `companyIds`, when given, scopes this to exactly that set (e.g. one
 * vehicle's linked companies) -- same optional-scope convention as
 * getPortfolioAlerts/getCompanyPerformanceTrends.
 */
export async function getReportingRequests(companyIds?: string[]): Promise<ReportingRequestRow[]> {
  const scope = await requireFalakRoleWithDepartmentScope("FALAK_OPERATIONS");

  const cycles = await db.reportingCycle.findMany({
    where: {
      archivedAt: null,
      company: { archivedAt: null, ...(scope.departments ? { department: { in: scope.departments } } : {}) },
      ...(companyIds ? { companyId: { in: companyIds } } : {}),
    },
    orderBy: { periodStart: "desc" },
    select: {
      id: true,
      periodLabel: true,
      periodStart: true,
      periodEnd: true,
      currentDeadline: true,
      status: true,
      openedAt: true,
      company: {
        select: {
          id: true,
          slug: true,
          nameEn: true,
          nameAr: true,
          ownershipPositions: {
            where: { vehicle: { archivedAt: null } },
            select: { vehicle: { select: { id: true, slug: true, nameEn: true, nameAr: true } } },
          },
        },
      },
      template: { select: { nameEn: true, nameAr: true } },
      submission: { select: { id: true, status: true } },
    },
  });

  const companyIdsInScope = [...new Set(cycles.map((c) => c.company.id))];
  const reports = companyIdsInScope.length
    ? await db.report.findMany({
        where: { scope: "COMPANY", companyId: { in: companyIdsInScope } },
        select: {
          companyId: true,
          periodStart: true,
          periodEnd: true,
          versions: {
            where: { isSuperseded: false },
            select: { id: true, distributions: { select: { status: true } } },
          },
        },
      })
    : [];

  const reportByKey = new Map(
    reports
      .filter((r) => r.companyId !== null)
      .map((r) => [reportKey(r.companyId!, r.periodStart, r.periodEnd), r.versions[0] ?? null] as const)
  );

  return cycles.map((cycle) => {
    const vehicles: ReportingRequestVehicleRef[] = [];
    const seen = new Set<string>();
    for (const position of cycle.company.ownershipPositions) {
      if (position.vehicle && !seen.has(position.vehicle.id)) {
        seen.add(position.vehicle.id);
        vehicles.push(position.vehicle);
      }
    }

    const version = reportByKey.get(reportKey(cycle.company.id, cycle.periodStart, cycle.periodEnd)) ?? null;
    const distribution: ReportingRequestDistributionSummary | null = version
      ? {
          total: version.distributions.length,
          sent: version.distributions.filter((d) => d.status === "Sent").length,
          pending: version.distributions.filter((d) => d.status === "Pending").length,
          failed: version.distributions.filter((d) => d.status === "Failed").length,
        }
      : null;

    return {
      cycleId: cycle.id,
      companyId: cycle.company.id,
      companySlug: cycle.company.slug,
      companyNameEn: cycle.company.nameEn,
      companyNameAr: cycle.company.nameAr,
      vehicles,
      templateNameEn: cycle.template.nameEn,
      templateNameAr: cycle.template.nameAr,
      periodLabel: cycle.periodLabel,
      periodStart: toDateOnly(cycle.periodStart),
      periodEnd: toDateOnly(cycle.periodEnd),
      currentDeadline: toDateOnly(cycle.currentDeadline),
      cycleStatus: cycle.status,
      requestedAt: toDateOnly(cycle.openedAt),
      submissionId: cycle.submission?.id ?? null,
      submissionStatus: cycle.submission?.status ?? null,
      reportVersionId: version?.id ?? null,
      isPublished: version !== null,
      distribution,
    };
  });
}
