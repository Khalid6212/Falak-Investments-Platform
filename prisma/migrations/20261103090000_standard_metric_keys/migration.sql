-- Startup templates built from plain labels got keys like "total_revenue"
-- and "burn_rate", which the charts and cards don't read. Rename them to
-- the standard keys. Values point at the metric by id, so every reported
-- figure stays attached. Checked beforehand: no template already has the
-- target key, and no template has two metrics mapping to the same one.
UPDATE "metric_definitions"
SET "key" = CASE "key"
    WHEN 'b2b_revenue' THEN 'revenue_b2b'
    WHEN 'b2b_revenue_if_applicable' THEN 'revenue_b2b'
    WHEN 'b2c_revenue' THEN 'fin_revenue_b2c'
    WHEN 'b2c_revenue_if_applicable' THEN 'fin_revenue_b2c'
    WHEN 'total_revenue' THEN 'fin_revenue_total'
    WHEN 'current_cash_balance' THEN 'fin_cash_balance'
    WHEN 'burn_rate' THEN 'fin_burn_rate'
    WHEN 'monthly_burn_rate' THEN 'fin_burn_rate'
    WHEN 'monthly_net_cash_flow' THEN 'fin_monthly_net_cash_flow'
    WHEN 'net_cash_flow' THEN 'fin_monthly_net_cash_flow'
    WHEN 'runway_months' THEN 'fin_runway_months'
    WHEN 'runway' THEN 'fin_runway_months'
  END,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" IN (
  'b2b_revenue', 'b2b_revenue_if_applicable', 'b2c_revenue', 'b2c_revenue_if_applicable',
  'total_revenue', 'current_cash_balance', 'burn_rate', 'monthly_burn_rate',
  'monthly_net_cash_flow', 'net_cash_flow', 'runway_months', 'runway'
);

-- One template (Units) has its "Total revenue" line under the key "if_applicable".
UPDATE "metric_definitions"
SET "key" = 'fin_revenue_total', "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'if_applicable' AND "labelEn" = 'Total revenue';
