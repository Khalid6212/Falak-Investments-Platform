import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMetricDate } from "../src/lib/reporting/metric-date.ts";

test("date metrics: every common way of writing a date becomes one day", () => {
  const cases: [string, string][] = [
    ["2026-12-31", "2026-12-31"],
    ["2026/12/31", "2026-12-31"],
    ["2026-12-31T00:00:00.000Z", "2026-12-31"],
    ["31/12/2026", "2026-12-31"],
    ["31-12-2026", "2026-12-31"],
    ["31.12.2026", "2026-12-31"],
    ["31/12/26", "2026-12-31"],
    ["12/31/2026", "2026-12-31"], // month first only because day first is impossible
    ["01/02/2027", "2027-02-01"], // ambiguous: day first
    ["31 Dec 2026", "2026-12-31"],
    ["31-Dec-2026", "2026-12-31"],
    ["December 31, 2026", "2026-12-31"],
    ["Dec 31st 2026", "2026-12-31"],
    ["31 ديسمبر 2026", "2026-12-31"],
    ["٣١/١٢/٢٠٢٦", "2026-12-31"],
    ["Jan 2027", "2027-01-01"],
    ["2027-07", "2027-07-01"],
    ["2027.07", "2027-07-01"],
    ["07/2027", "2027-07-01"],
    ["31012027", "2027-01-31"],
    ["1032027", "2027-03-01"],
    ["20270131", "2027-01-31"],
    ["46387", "2026-12-31"], // Excel day number
  ];
  for (const [raw, want] of cases) assert.equal(parseMetricDate(raw), want, raw);
});

test("date metrics: things that aren't a real date are refused", () => {
  for (const raw of ["", "12", "850", "31/02/2027", "32/01/2027", "soon", "Q3 2026", "13/13/2026", "1,200"]) {
    assert.equal(parseMetricDate(raw), null, raw);
  }
});
