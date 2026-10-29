-- "Expected cash out date" was set up as a Number in the startup
-- templates, so founders typed dates as numbers (31012027 = 31/01/2027).
-- It becomes a Date metric; answers that are clearly dates become that
-- day (YYYY-MM-DD), anything else is kept exactly as typed, as text, for
-- the team to correct. (Separate from the enum change: a new enum value
-- can't be used in the transaction that adds it.)

UPDATE "metric_definitions"
SET "dataType" = 'Date', "updatedAt" = now()
WHERE "key" = 'expected_cash_out_date' AND "dataType" = 'Number';

UPDATE "submission_metric_values" v
SET "textValue" = CASE v."numericValue"
      WHEN 31012027 THEN '2027-01-31'
      WHEN 31032027 THEN '2027-03-31'
      WHEN 1032027  THEN '2027-03-01'
      WHEN 2027.07  THEN '2027-07-01'
      ELSE trim_scale(v."numericValue")::text
    END,
    "numericValue" = NULL,
    "updatedAt" = now()
FROM "metric_definitions" m
WHERE m."id" = v."metricDefinitionId"
  AND m."key" = 'expected_cash_out_date'
  AND v."numericValue" IS NOT NULL;
