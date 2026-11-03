// Pure, deliberately dependency-free functions (no @/lib/db, no
// server-only) -- margins/growth/projection are display-time
// computations over already-fetched numbers, never stored as their own
// SubmissionMetricValue. Confirmed with the project owner: COGS is a
// real submitted field precisely so Gross Margin can be computed
// correctly instead of guessed.

/**
 * Gross Margin % = (Revenue - COGS) / Revenue. null whenever Revenue or
 * COGS themselves are null/not yet reported, or Revenue is 0 (division
 * by zero is not "0% margin", it's "undefined") -- never silently
 * produces a misleading number from incomplete data.
 */
export function computeGrossMargin(revenue: number | null, cogs: number | null): number | null {
  if (revenue === null || cogs === null || revenue === 0) return null;
  return (revenue - cogs) / revenue;
}

/** Net Margin % = (Revenue - Expenses) / Revenue. Same null/zero rules. */
export function computeNetMargin(revenue: number | null, expenses: number | null): number | null {
  if (revenue === null || expenses === null || revenue === 0) return null;
  return (revenue - expenses) / revenue;
}

/**
 * Generic prior-vs-current percentage change -- used for Revenue Growth
 * % and every row of the branded report's QoQ Growth column alike. null
 * when either side is missing or the prior value is 0 (a "from zero"
 * growth rate is not a meaningful percentage), or when the two have
 * opposite signs (no percentage describes crossing zero). Measured against
 * the prior value's size, so a figure falling from -100 to -150 is -50%.
 */
export function percentChange(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  if (current !== 0 && Math.sign(current) !== Math.sign(previous)) return null;
  return (current - previous) / Math.abs(previous);
}

/**
 * Monthly burn: the reported Burn Rate when submitted; otherwise derived
 * from Monthly Net Cash Flow (burn = outflow), or failing that from the
 * quarter's Total Expenses minus Revenue spread over 3 months. Floored
 * at 0 -- a cash-generating company burns nothing, never a negative burn.
 */
export function deriveMonthlyBurn(inputs: {
  reportedBurn: number | null;
  monthlyNetCashFlow: number | null;
  quarterRevenue: number | null;
  quarterExpenses: number | null;
}): number | null {
  if (inputs.reportedBurn !== null) return inputs.reportedBurn;
  if (inputs.monthlyNetCashFlow !== null) return Math.max(0, -inputs.monthlyNetCashFlow);
  if (inputs.quarterRevenue !== null && inputs.quarterExpenses !== null) {
    return Math.max(0, (inputs.quarterExpenses - inputs.quarterRevenue) / 3);
  }
  return null;
}

/** Runway: the reported figure when submitted; otherwise Cash Balance / monthly burn. */
export function deriveRunwayMonths(
  reportedRunway: number | null,
  cashBalance: number | null,
  monthlyBurn: number | null
): number | null {
  if (reportedRunway !== null) return reportedRunway;
  if (cashBalance !== null && monthlyBurn !== null && monthlyBurn > 0) return cashBalance / monthlyBurn;
  return null;
}

/**
 * Revenue Projection = latest period's Total Revenue x 4 (a simple
 * run-rate annualization) -- verified against the source PDF's own
 * numbers: $160.0K x 4 = $640.0K exactly.
 */
export function computeRevenueProjection(latestPeriodRevenue: number | null): number | null {
  if (latestPeriodRevenue === null) return null;
  return latestPeriodRevenue * 4;
}
