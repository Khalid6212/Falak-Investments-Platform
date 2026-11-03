// Shared by admin/company/vehicle/investor queries.ts -- revenue is now
// two metrics (B2B + B2C), not one. revenue_b2b is the exact key every
// existing company's template already uses (reused verbatim, not
// renamed, so nothing already-submitted needs migrating); fin_revenue_b2c
// is new.
// Plain (mutable) string[], not `as const` -- Prisma's `key: { in: ... }`
// filter expects a mutable string[] for its generated type, and a
// readonly tuple there breaks its overload resolution (cascades into
// every nested `select` on the same query losing its real inferred
// type).
export const REVENUE_METRIC_KEYS: string[] = ["revenue_b2b", "fin_revenue_b2c", "fin_revenue_total"];

// The split lines; a reported total is used only when neither is filled in.
const REVENUE_SPLIT_KEYS = ["revenue_b2b", "fin_revenue_b2c"];
const REVENUE_TOTAL_KEY = "fin_revenue_total";

export interface RevenueMetricValueInput {
  metricDefinition: { key: string };
  numericValue: { toNumber: () => number } | null;
  isNa: boolean;
}

/**
 * Each missing/isNa line is treated as contributing 0 to the total,
 * UNLESS every line is missing/isNa, in which case the total is null --
 * same "don't coerce genuine absence into a false number" rule
 * computeRevenueByCurrency already follows for the portfolio-wide KPI.
 * A company that only reports B2B (B2C truly not applicable) still gets
 * a real total; a company that reports nothing gets null, not 0.
 * A company that reports only a total revenue line gets that total.
 */
export function sumRevenueMetricValues(values: RevenueMetricValueInput[]): number | null {
  const withData = values.filter((v) => !v.isNa && v.numericValue !== null);
  const split = withData.filter((v) => REVENUE_SPLIT_KEYS.includes(v.metricDefinition.key));
  if (split.length > 0) return split.reduce((sum, v) => sum + v.numericValue!.toNumber(), 0);

  const total = withData.find((v) => v.metricDefinition.key === REVENUE_TOTAL_KEY);
  return total ? total.numericValue!.toNumber() : null;
}
