import { test } from "node:test";
import assert from "node:assert/strict";

const { normaliseNumber } = await import("../src/lib/reporting/metrics.ts");

test("numbers: negatives in every common form", () => {
  const cases: [string, string][] = [
    ["-40,000", "-40000"],
    ["−40,000", "-40000"], // typographic minus (Excel/Word)
    ["–40000", "-40000"], // en dash
    ["(40,000)", "-40000"], // accounting style
    ["40,000-", "-40000"], // trailing minus
    ["- 1 250.5", "-1250.5"],
    ["SAR -12,500", "-12500"],
    ["-$1,000", "-1000"],
    ["(USD 2,000.75)", "-2000.75"],
    ["-12.5%", "-12.5"],
    ["-.5", "-0.5"],
    ["-0", "0"],
    ["٢٥٠٬٠٠٠", "250000"],
    ["-١٢٫٥", "-12.5"],
    ["+300", "300"],
    ["250,000", "250000"],
    ["1250.50", "1250.50"],
  ];
  for (const [input, expected] of cases) assert.equal(normaliseNumber(input), expected, input);
});

test("numbers: still rejects what isn't a number", () => {
  for (const input of ["abc", "-", "()", "1.2.3", "12-5", "--", "1e5", "123456789012345"]) {
    assert.equal(normaliseNumber(input), null, input);
  }
});
