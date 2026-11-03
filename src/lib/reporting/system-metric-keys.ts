import { REVENUE_METRIC_KEYS } from "@/lib/reporting/revenue-metrics";
import { BURN_KEYS, CASH_KEYS, EXPENSES_KEYS, NET_CASH_FLOW_KEYS, RUNWAY_KEYS } from "@/lib/reporting/cash-runway";

// Metric keys the platform reads by name for charts, the quarterly report,
// benchmarks and alerts. A metric with startup values under one of these
// keys can't be renamed in the template editor: its history would drop out
// of those views.
export const SYSTEM_METRIC_KEYS = new Set<string>([
  ...REVENUE_METRIC_KEYS,
  ...CASH_KEYS,
  ...BURN_KEYS,
  ...NET_CASH_FLOW_KEYS,
  ...RUNWAY_KEYS,
  ...EXPENSES_KEYS,
  "fin_cogs",
  "cust_active_customers",
  "cust_arpu",
  "cust_b2b_clients",
  "cust_b2b_deals",
  "cust_b2c_deals",
  "cust_b2c_users",
  "cust_cac",
  "cust_churn_rate",
  "cust_new_customers",
  "health_overdue_payables",
  "health_overdue_receivables",
]);

/** Data types stored as a number: switching among these keeps answers readable. */
export const NUMERIC_DATA_TYPES = new Set<string>(["Currency", "Percent", "Number"]);

// Keys a template gets when built from plain labels ("Total revenue",
// "Burn rate"), mapped to the keys above, so the charts and cards read
// them. Only measures whose meaning is unambiguous are listed. Expenses
// stay out: the page would compute a net margin from them that can
// contradict the margin the startup reported.
const STANDARD_KEY_ALIASES: Record<string, string> = {
  b2b_revenue: "revenue_b2b",
  b2b_revenue_if_applicable: "revenue_b2b",
  b2c_revenue: "fin_revenue_b2c",
  b2c_revenue_if_applicable: "fin_revenue_b2c",
  total_revenue: "fin_revenue_total",
  current_cash_balance: "fin_cash_balance",
  cash_balance: "fin_cash_balance",
  burn_rate: "fin_burn_rate",
  monthly_burn_rate: "fin_burn_rate",
  monthly_net_cash_flow: "fin_monthly_net_cash_flow",
  net_cash_flow: "fin_monthly_net_cash_flow",
  runway_months: "fin_runway_months",
};

export function standardMetricKey(key: string): string {
  return STANDARD_KEY_ALIASES[key] ?? key;
}
