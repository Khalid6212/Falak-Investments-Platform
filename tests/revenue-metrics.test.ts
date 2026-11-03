import { test } from "node:test";
import assert from "node:assert/strict";
import { sumRevenueMetricValues, REVENUE_METRIC_KEYS } from "../src/lib/reporting/revenue-metrics.ts";

function value(key: string, amount: number | null, isNa = false) {
  return {
    metricDefinition: { key },
    numericValue: amount === null ? null : { toNumber: () => amount },
    isNa,
  };
}

test("REVENUE_METRIC_KEYS covers B2B, B2C and a reported total", () => {
  assert.deepEqual(REVENUE_METRIC_KEYS, ["revenue_b2b", "fin_revenue_b2c", "fin_revenue_total"]);
});

test("a reported total is used only when neither B2B nor B2C is filled in", () => {
  assert.equal(sumRevenueMetricValues([value("fin_revenue_total", 95)]), 95);
  assert.equal(sumRevenueMetricValues([value("revenue_b2b", null, true), value("fin_revenue_total", 95)]), 95);
  assert.equal(sumRevenueMetricValues([value("revenue_b2b", 100), value("fin_revenue_b2c", 60), value("fin_revenue_total", 160)]), 160);
  assert.equal(sumRevenueMetricValues([value("revenue_b2b", 100), value("fin_revenue_total", 999)]), 100);
  assert.equal(sumRevenueMetricValues([value("fin_revenue_total", null, true)]), null);
});

test("sums B2B + B2C when both present", () => {
  const total = sumRevenueMetricValues([value("revenue_b2b", 100), value("fin_revenue_b2c", 60)]);
  assert.equal(total, 160);
});

test("B2B present, B2C absent entirely -> B2B alone (absence treated as 0)", () => {
  const total = sumRevenueMetricValues([value("revenue_b2b", 100)]);
  assert.equal(total, 100);
});

test("B2B present, B2C explicitly N/A -> B2B alone", () => {
  const total = sumRevenueMetricValues([value("revenue_b2b", 100), value("fin_revenue_b2c", null, true)]);
  assert.equal(total, 100);
});

test("both missing entirely -> null, not 0", () => {
  const total = sumRevenueMetricValues([]);
  assert.equal(total, null);
});

test("both present but N/A -> null, not 0", () => {
  const total = sumRevenueMetricValues([value("revenue_b2b", null, true), value("fin_revenue_b2c", null, true)]);
  assert.equal(total, null);
});

test("unrelated metric keys are ignored", () => {
  const total = sumRevenueMetricValues([value("revenue_b2b", 100), value("fin_cogs", 999)]);
  assert.equal(total, 100);
});
