import { test } from "node:test";
import assert from "node:assert/strict";

const { periodPhrase, longDate } = await import("../src/lib/email/report-wording.ts");

test("report wording: calendar quarters read as words, other periods use their label", () => {
  assert.equal(periodPhrase(new Date("2026-07-01T00:00:00Z"), new Date("2026-09-30T00:00:00Z"), "Q3 2026"), "Quarter Three (Q3 2026)");
  assert.equal(periodPhrase(new Date("2026-01-01T00:00:00Z"), new Date("2026-03-31T00:00:00Z"), "Q1 2026"), "Quarter One (Q1 2026)");
  assert.equal(periodPhrase(new Date("2026-01-01T00:00:00Z"), new Date("2026-06-30T00:00:00Z"), "H1 2026"), "the H1 2026 period");
  assert.equal(longDate(new Date("2026-10-15T00:00:00Z")), "15 October 2026");
});
