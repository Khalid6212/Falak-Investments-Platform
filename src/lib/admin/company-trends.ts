import "server-only";
import { db } from "@/lib/db";
import { requireFalakRoleWithDepartmentScope } from "@/lib/auth/department-scope";
import { fetchSubmissionMetricFields } from "@/lib/reporting/metrics";
import { findNumericMetricValue } from "@/lib/reporting/metric-format";
import { REVENUE_METRIC_KEYS, sumRevenueMetricValues } from "@/lib/reporting/revenue-metrics";
import { deriveMonthlyBurn, deriveRunwayMonths } from "@/lib/reporting/computed-metrics";
import type { Currency } from "@/generated/prisma/client";
import type { CompanyTrendPoint } from "./company-trend-row";

export type { CompanyTrendPoint } from "./company-trend-row";

export interface CompanyTrendDTO {
  companyId: string;
  companySlug: string;
  companyNameEn: string;
  companyNameAr: string;
  currency: Currency;
  points: CompanyTrendPoint[];
}

/**
 * Falak-staff-only. One row per non-archived company with its per-period
 * revenue/burn/runway history, in the company's own currency. Burn and
 * runway are derived from other submitted metrics when not reported
 * directly. QoQ growth is computed client-side for whichever period the
 * viewer selects (computeTrendRow). A company with no reported periods
 * still gets a row -- "no data yet" is itself worth seeing.
 *
 * `companyIds`, when given, scopes this to exactly that set (e.g. one
 * vehicle's linked companies) -- omitted/undefined covers every
 * non-archived company, the original portfolio-wide behavior.
 */
export async function getCompanyPerformanceTrends(companyIds?: string[]): Promise<CompanyTrendDTO[]> {
  const scope = await requireFalakRoleWithDepartmentScope("FALAK_OPERATIONS");

  const companies = await db.company.findMany({
    where: {
      archivedAt: null,
      ...(companyIds ? { id: { in: companyIds } } : {}),
      ...(scope.departments ? { department: { in: scope.departments } } : {}),
    },
    orderBy: { nameEn: "asc" },
    select: {
      id: true,
      slug: true,
      nameEn: true,
      nameAr: true,
      currency: true,
      cycles: {
        where: { archivedAt: null },
        orderBy: { periodStart: "asc" },
        select: {
          periodLabel: true,
          periodStart: true,
          templateId: true,
          submission: {
            select: {
              id: true,
              metricValues: {
                where: { metricDefinition: { key: { in: REVENUE_METRIC_KEYS } } },
                select: { metricDefinition: { select: { key: true } }, numericValue: true, isNa: true },
              },
            },
          },
        },
      },
    },
  });

  return Promise.all(
    companies.map(async (company) => {
      const points: CompanyTrendPoint[] = [];
      for (const cycle of company.cycles) {
        if (!cycle.submission) continue;
        const revenue = sumRevenueMetricValues(cycle.submission.metricValues);
        const metrics = await fetchSubmissionMetricFields(db, cycle.submission.id, cycle.templateId);
        const burn = deriveMonthlyBurn({
          reportedBurn: findNumericMetricValue(metrics, "fin_burn_rate"),
          monthlyNetCashFlow: findNumericMetricValue(metrics, "fin_monthly_net_cash_flow"),
          quarterRevenue: revenue,
          quarterExpenses: findNumericMetricValue(metrics, "fin_expenses"),
        });
        points.push({
          periodLabel: cycle.periodLabel,
          periodStart: cycle.periodStart.toISOString().slice(0, 10),
          revenue,
          burn,
          runwayMonths: deriveRunwayMonths(
            findNumericMetricValue(metrics, "fin_runway_months"),
            findNumericMetricValue(metrics, "fin_cash_balance"),
            burn
          ),
        });
      }

      return {
        companyId: company.id,
        companySlug: company.slug,
        companyNameEn: company.nameEn,
        companyNameAr: company.nameAr,
        currency: company.currency,
        points,
      };
    })
  );
}
