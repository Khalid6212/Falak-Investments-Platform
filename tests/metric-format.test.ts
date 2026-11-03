import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizePercentUnits, formatMetricValue } from "../src/lib/reporting/metric-format.ts";

function field(key: string, dataType: string, value: string | null, isNa = false) {
  return { metricDefinitionId: key, key, labelEn: key, labelAr: key, dataType, required: false, sortOrder: 0, value, isNa } as never;
}

test("percentages typed as fractions (0.8421) are scaled to read like 84.21", () => {
  const out = normalizePercentUnits([
    field("gross_margin", "Percent", "0.8421"),
    field("net_margin", "Percent", "-1.1461"),
    field("churn_rate", "Percent", null, true),
    field("cac", "Number", "0.5"),
  ]) as { value: string | null }[];
  assert.equal(Number(out[0].value), 84.21);
  assert.equal(Number(out[1].value), -114.61);
  assert.equal(out[2].value, null);
  assert.equal(out[3].value, "0.5");
});

test("percentages already typed as whole numbers are left alone", () => {
  const input = [field("gross_margin", "Percent", "84.52"), field("revenue_growth", "Percent", "0.5")];
  assert.deepEqual(normalizePercentUnits(input), input);
});

test("percentages display with one decimal", () => {
  assert.equal(formatMetricValue(field("gross_margin", "Percent", "84.21"), "USD", "en"), "84.2%");
});
