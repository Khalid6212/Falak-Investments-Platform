import "server-only";
import { db } from "@/lib/db";
import { requireFalakRoleWithDepartmentScope } from "@/lib/auth/department-scope";
import { fetchSubmissionMetricFields } from "@/lib/reporting/metrics";
import { findNumericMetricValue, findMetric } from "@/lib/reporting/metric-format";

// Thresholds are a judgment call, not a value pulled from any reference
// platform's own default -- flagged here as the one place to retune them.
const LOW_RUNWAY_MONTHS = 6;
const CRITICAL_RUNWAY_MONTHS = 3;

export type AlertSeverity = "high" | "medium";
export type AlertKind = "reporting_overdue" | "low_runway" | "overdue_payables" | "overdue_receivables";

export interface PortfolioAlert {
  companyId: string;
  companySlug: string;
  companyNameEn: string;
  companyNameAr: string;
  kind: AlertKind;
  severity: AlertSeverity;
  // Structured detail, not a pre-built English sentence -- the client
  // component localizes the actual message from `kind` (+ these params)
  // via the dictionary, the same "server returns data, client renders
  // text" split every other DTO in this codebase follows.
  deadline?: string;
  runwayMonths?: number;
}

const SUBMITTED_STATUSES = ["submitted", "under_review", "approved"];

/**
 * Falak-staff-only, same gate as getAdminPortfolioData. Deliberately a
 * separate query from that function rather than an extra field threaded
 * through AdminCompanyDTO -- alerts need the full metric set per
 * company's latest submission (via fetchSubmissionMetricFields, the same
 * helper MetricsBreakdown/QuarterlyReportDocument already use), which
 * getAdminPortfolioData's periodsData was never shaped to carry, and nothing
 * else needs that shape.
 *
 * `companyIds`, when given, scopes this to exactly that set (e.g. one
 * vehicle's linked companies, for the vehicle dashboard's own alerts
 * panel) -- omitted/undefined covers the whole portfolio, the original
 * behavior.
 */
export async function getPortfolioAlerts(companyIds?: string[]): Promise<PortfolioAlert[]> {
  const scope = await requireFalakRoleWithDepartmentScope("FALAK_OPERATIONS");

  const companies = await db.company.findMany({
    where: {
      archivedAt: null,
      ...(companyIds ? { id: { in: companyIds } } : {}),
      ...(scope.departments ? { department: { in: scope.departments } } : {}),
    },
    select: {
      id: true,
      slug: true,
      nameEn: true,
      nameAr: true,
      cycles: {
        where: { archivedAt: null },
        orderBy: { periodStart: "asc" },
        select: {
          templateId: true,
          currentDeadline: true,
          submission: { select: { id: true, status: true } },
        },
      },
    },
  });

  const alerts: PortfolioAlert[] = [];
  const now = new Date();

  for (const company of companies) {
    for (const cycle of company.cycles) {
      const isSubmitted = cycle.submission ? SUBMITTED_STATUSES.includes(cycle.submission.status) : false;
      if (!isSubmitted && cycle.currentDeadline.getTime() < now.getTime()) {
        alerts.push({
          companyId: company.id,
          companySlug: company.slug,
          companyNameEn: company.nameEn,
          companyNameAr: company.nameAr,
          kind: "reporting_overdue",
          severity: "high",
          deadline: cycle.currentDeadline.toISOString().slice(0, 10),
        });
      }
    }

    const latestCycle = [...company.cycles].reverse().find((c) => c.submission !== null);
    if (!latestCycle || !latestCycle.submission) continue;

    const metrics = await fetchSubmissionMetricFields(db, latestCycle.submission.id, latestCycle.templateId);

    const runway = findNumericMetricValue(metrics, "fin_runway_months");
    if (runway !== null && runway < LOW_RUNWAY_MONTHS) {
      alerts.push({
        companyId: company.id,
        companySlug: company.slug,
        companyNameEn: company.nameEn,
        companyNameAr: company.nameAr,
        kind: "low_runway",
        severity: runway < CRITICAL_RUNWAY_MONTHS ? "high" : "medium",
        runwayMonths: runway,
      });
    }

    const overduePayables = findMetric(metrics, "health_overdue_payables");
    if (overduePayables?.value === "Yes" && !overduePayables.isNa) {
      alerts.push({
        companyId: company.id,
        companySlug: company.slug,
        companyNameEn: company.nameEn,
        companyNameAr: company.nameAr,
        kind: "overdue_payables",
        severity: "medium",
      });
    }

    const overdueReceivables = findMetric(metrics, "health_overdue_receivables");
    if (overdueReceivables?.value === "Yes" && !overdueReceivables.isNa) {
      alerts.push({
        companyId: company.id,
        companySlug: company.slug,
        companyNameEn: company.nameEn,
        companyNameAr: company.nameAr,
        kind: "overdue_receivables",
        severity: "medium",
      });
    }
  }

  return alerts.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "high" ? -1 : 1));
}
