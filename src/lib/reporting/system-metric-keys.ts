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
