import "server-only";
import { db } from "@/lib/db";
import { requireFalakRoleWithDepartmentScope } from "@/lib/auth/department-scope";
import { fetchSubmissionMetricFields } from "@/lib/reporting/metrics";
import { findNumericMetricValue } from "@/lib/reporting/metric-format";

// Whether a lower or higher raw value is the "better" one for this
// metric -- drives which direction counts as "outperforming a peer"
// below. Judgment call, not derived from the metric's own dataType.
const BENCHMARK_METRIC_KEYS: { key: string; higherIsBetter: boolean }[] = [
  { key: "cust_churn_rate", higherIsBetter: false },
  { key: "cust_arpu", higherIsBetter: true },
  { key: "cust_cac", higherIsBetter: false },
  { key: "fin_burn_rate", higherIsBetter: false },
];

export interface CompanyMetricBenchmark {
  key: string;
  labelEn: string;
  labelAr: string;
  value: number;
  // Percentile rank among this period's reporting peers, 0-100 --
  // the fraction of peers this company outperforms. null when there
  // are no peers to compare against (this company is the only one
  // reporting this metric this period).
  percentile: number | null;
}

export interface CompanyBenchmark {
  companyId: string;
  companySlug: string;
  companyNameEn: string;
  companyNameAr: string;
  metrics: CompanyMetricBenchmark[];
}

/**
 * Falak-staff-only. For a given period, every company that reported each
 * benchmark metric gets a percentile rank among the peers who also
 * reported it that period -- a company that didn't report a given metric
 * (isNa or simply not submitted) is excluded from that metric's
 * comparison set entirely, never coerced into a 0 or a trivial 100th
 * percentile.
 */
export async function getPortfolioBenchmarks(periodLabel: string): Promise<CompanyBenchmark[]> {
  const scope = await requireFalakRoleWithDepartmentScope("FALAK_OPERATIONS");

  const companies = await db.company.findMany({
    where: { archivedAt: null, ...(scope.departments ? { department: { in: scope.departments } } : {}) },
    select: {
      id: true,
      slug: true,
      nameEn: true,
      nameAr: true,
      cycles: {
        where: { periodLabel, archivedAt: null },
        select: { templateId: true, submission: { select: { id: true } } },
      },
    },
  });

  const perCompanyMetrics = await Promise.all(
    companies.map(async (company) => {
      const cycle = company.cycles[0];
      if (!cycle?.submission) return { company, metrics: null };
      const metrics = await fetchSubmissionMetricFields(db, cycle.submission.id, cycle.templateId);
      return { company, metrics };
    })
  );

  // valuesByKey[metricKey] = [{ companyId, value }] -- only companies that
  // actually reported a real (non-N/A, numeric) value for that key.
  const valuesByKey = new Map<string, { companyId: string; value: number }[]>();
  // Real, admin-defined labels for each key, taken from whichever
  // company's own MetricDefinition this key is first seen on -- there is
  // no portfolio-wide label source otherwise, and every company on the
  // same template defines the same label anyway.
  const labelsByKey = new Map<string, { labelEn: string; labelAr: string }>();
  for (const { company, metrics } of perCompanyMetrics) {
    if (!metrics) continue;
    for (const { key } of BENCHMARK_METRIC_KEYS) {
      const field = metrics.find((m) => m.key === key);
      if (field && !labelsByKey.has(key)) {
        labelsByKey.set(key, { labelEn: field.labelEn, labelAr: field.labelAr });
      }
      const value = findNumericMetricValue(metrics, key);
      if (value === null) continue;
      const list = valuesByKey.get(key) ?? [];
      list.push({ companyId: company.id, value });
      valuesByKey.set(key, list);
    }
  }

  return companies
    .map((company) => {
      const metrics: CompanyMetricBenchmark[] = [];
      for (const { key, higherIsBetter } of BENCHMARK_METRIC_KEYS) {
        const peers = valuesByKey.get(key) ?? [];
        const mine = peers.find((p) => p.companyId === company.id);
        if (!mine) continue;

        const others = peers.filter((p) => p.companyId !== company.id);
        const percentile =
          others.length === 0
            ? null
            : (others.filter((p) => (higherIsBetter ? p.value < mine.value : p.value > mine.value)).length / others.length) * 100;

        const labels = labelsByKey.get(key) ?? { labelEn: key, labelAr: key };
        metrics.push({ key, labelEn: labels.labelEn, labelAr: labels.labelAr, value: mine.value, percentile });
      }
      return {
        companyId: company.id,
        companySlug: company.slug,
        companyNameEn: company.nameEn,
        companyNameAr: company.nameAr,
        metrics,
      };
    })
    .filter((c) => c.metrics.length > 0);
}
