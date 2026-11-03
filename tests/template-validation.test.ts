import { test } from "node:test";
import assert from "node:assert/strict";

const { validateNewTemplate, toMetricKey } = await import("../src/lib/admin/template-validation.ts");

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

const NAMES = { nameEn: "Quarterly", nameAr: "ربع سنوي" };

test("keys are normalised from whatever is typed, or made from the English label", () => {
  assert.equal(toMetricKey("Revenue B2B"), "revenue_b2b");
  assert.equal(toMetricKey("  churn-rate % "), "churn_rate");
  assert.equal(toMetricKey("2024 Revenue"), "m_2024_revenue");
  assert.equal(toMetricKey("إيرادات"), "");
  // Common measures get the keys the charts read.
  assert.equal(toMetricKey("Total revenue"), "fin_revenue_total");
  assert.equal(toMetricKey("B2B revenue (if applicable)"), "revenue_b2b");
  assert.equal(toMetricKey("Burn rate"), "fin_burn_rate");
  assert.equal(toMetricKey("Current cash balance"), "fin_cash_balance");
  assert.equal(toMetricKey("Runway months"), "fin_runway_months");

  const { input } = validateNewTemplate(
    form({
      ...NAMES,
      metricKey_0: "Revenue B2B",
      metricLabelEn_0: "B2B Revenue",
      metricLabelAr_0: "الإيرادات",
      metricDataType_0: "Currency",
      metricLabelEn_1: "Active Customers",
      metricLabelAr_1: "العملاء النشطون",
      metricDataType_1: "Number",
    })
  );
  assert.deepEqual(input?.metrics.map((m) => m.key), ["revenue_b2b", "active_customers"]);
});

test("empty rows are ignored; only the bad fields are flagged and everything typed comes back", () => {
  const { input, errors, values } = validateNewTemplate(
    form({
      ...NAMES,
      metricLabelEn_0: "Revenue",
      metricLabelAr_0: "",
      metricDataType_0: "Currency",
      metricLabelEn_2: "Cash",
      metricLabelAr_2: "النقد",
    })
  );
  assert.equal(input, null);
  assert.deepEqual(Object.keys(errors).sort(), ["metricDataType_2", "metricLabelAr_0"]);
  assert.equal(values.metricLabelEn_0, "Revenue");
});

test("two metrics that end up with the same key are flagged on the second one", () => {
  const { errors } = validateNewTemplate(
    form({
      ...NAMES,
      metricLabelEn_0: "Revenue",
      metricLabelAr_0: "الإيرادات",
      metricDataType_0: "Currency",
      metricKey_1: "revenue",
      metricLabelEn_1: "Other",
      metricLabelAr_1: "أخرى",
      metricDataType_1: "Number",
    })
  );
  assert.deepEqual(Object.keys(errors), ["metricKey_1"]);
});

test("a template with no metrics is flagged on the first row", () => {
  const { errors } = validateNewTemplate(form(NAMES));
  assert.deepEqual(Object.keys(errors), ["metricLabelEn_0"]);
});
