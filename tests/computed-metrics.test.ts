import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeGrossMargin,
  computeNetMargin,
  percentChange,
  computeRevenueProjection,
} from "../src/lib/reporting/computed-metrics.ts";

test("computeGrossMargin: (revenue - cogs) / revenue", () => {
  assert.equal(computeGrossMargin(200, 80), 0.6);
});

test("computeGrossMargin: null revenue -> null", () => {
  assert.equal(computeGrossMargin(null, 80), null);
});

test("computeGrossMargin: null cogs -> null", () => {
  assert.equal(computeGrossMargin(200, null), null);
});

test("computeGrossMargin: zero revenue -> null, not Infinity/NaN", () => {
  assert.equal(computeGrossMargin(0, 10), null);
});

test("computeNetMargin: (revenue - expenses) / revenue", () => {
  assert.equal(computeNetMargin(200, 150), 0.25);
});

test("computeNetMargin: null expenses -> null", () => {
  assert.equal(computeNetMargin(200, null), null);
});

test("computeNetMargin: zero revenue -> null", () => {
  assert.equal(computeNetMargin(0, 10), null);
});

test("percentChange: standard QoQ growth", () => {
  assert.equal(percentChange(120, 100), 0.2);
});

test("percentChange: decline is negative", () => {
  assert.equal(percentChange(80, 100), -0.2);
});

test("percentChange: null current -> null", () => {
  assert.equal(percentChange(null, 100), null);
});

test("percentChange: null previous -> null", () => {
  assert.equal(percentChange(120, null), null);
});

test("percentChange: between negatives, a figure falling further is negative growth", () => {
  assert.equal(percentChange(-150, -100), -0.5);
  assert.equal(percentChange(-50, -100), 0.5);
});

test("percentChange: crossing zero has no percentage", () => {
  assert.equal(percentChange(50, -100), null);
  assert.equal(percentChange(-50, 100), null);
});

test("percentChange: zero previous -> null, not Infinity", () => {
  assert.equal(percentChange(120, 0), null);
});

test("computeRevenueProjection: latest period x4 (PDF's own $160.0K x 4 = $640.0K case)", () => {
  assert.equal(computeRevenueProjection(160_000), 640_000);
});

test("computeRevenueProjection: null -> null", () => {
  assert.equal(computeRevenueProjection(null), null);
});
