import { test } from "node:test";
import assert from "node:assert/strict";
import { setCurrentUser, setDbStub, makeVehicleCapTableDbStub, REAL_USER } from "./support/stubs.ts";

const { getVehicleCapitalOverview } = await import("../src/lib/vehicle/cap-table.ts");
const { computeVehicleCapTable } = await import("../src/lib/vehicle/cap-table-compute.ts");
const { ForbiddenError } = await import("../src/lib/auth/authorization-errors.ts");

const OPS = [{ role: "FALAK_OPERATIONS" }];
const A = { id: "inv_a", nameEn: "Investor A", nameAr: "أ" };
const B = { id: "inv_b", nameEn: "Investor B", nameAr: "ب" };

test("denies a caller with no Falak role", async () => {
  setCurrentUser(REAL_USER);
  setDbStub(makeVehicleCapTableDbStub({ falakRoles: [] }));
  await assert.rejects(() => getVehicleCapitalOverview("veh_1"), ForbiddenError);
});

test("cap table: contributed, net invested (minus fees), and ownership as share of contributions", async () => {
  setCurrentUser(REAL_USER);
  setDbStub(
    makeVehicleCapTableDbStub({
      falakRoles: OPS,
      agreements: [
        { vehicleId: "veh_1", investedAmount: 1_000_000, currency: "SAR" },
        { vehicleId: "veh_1", investedAmount: 100_000, currency: "USD" }, // 375,000 SAR
        { vehicleId: "veh_1", investedAmount: null, currency: "SAR" },
        { vehicleId: "veh_other", investedAmount: 9_999_999, currency: "SAR" },
      ],
      positions: [
        { vehicleId: "veh_1", investor: A, commitmentAmount: 550_000, ownershipPct: 0.5, currency: "SAR" },
        // Same investor, second position -- one row, summed.
        { vehicleId: "veh_1", investor: A, commitmentAmount: 137_500, ownershipPct: 0.1, currency: "SAR" },
        { vehicleId: "veh_1", investor: B, commitmentAmount: 50_000, ownershipPct: null, currency: "USD" },
      ],
      fees: [{ vehicleId: "veh_1", investorId: "inv_a", amount: 20_000, currency: "SAR" }],
    })
  );

  const overview = await getVehicleCapitalOverview("veh_1");
  const sar = computeVehicleCapTable(overview, "SAR");

  assert.equal(sar.investedCapital, 1_375_000);
  assert.equal(sar.rows.length, 2);
  const [a, b] = sar.rows;
  assert.equal(a.investorId, "inv_a");
  assert.equal(a.contributed, 687_500);
  assert.equal(a.netInvested, 667_500);
  assert.equal(b.contributed, 187_500);
  assert.equal(b.netInvested, 187_500);
  assert.equal(sar.totals.contributed, 875_000);
  assert.ok(Math.abs(a.ownershipPct! - 687_500 / 875_000) < 1e-12);
  assert.ok(Math.abs(b.ownershipPct! - 187_500 / 875_000) < 1e-12);
  assert.ok(Math.abs(sar.totals.ownershipPct! - 1) < 1e-12);

  // Ownership is a ratio -- identical whichever display currency is chosen.
  const usd = computeVehicleCapTable(overview, "USD");
  assert.ok(Math.abs(usd.investedCapital - 1_375_000 / 3.75) < 1e-6);
  assert.ok(Math.abs(usd.rows[0].ownershipPct! - a.ownershipPct!) < 1e-12);
});

test("cap table: with nothing contributed yet, ownership falls back to the stored %", async () => {
  setCurrentUser(REAL_USER);
  setDbStub(
    makeVehicleCapTableDbStub({
      falakRoles: OPS,
      positions: [{ vehicleId: "veh_1", investor: A, commitmentAmount: null, ownershipPct: 0.25, currency: "SAR" }],
    })
  );
  const table = computeVehicleCapTable(await getVehicleCapitalOverview("veh_1"), "SAR");
  assert.equal(table.rows[0].contributed, 0);
  assert.equal(table.rows[0].ownershipPct, 0.25);
});

test("cap table: amounts recorded per startup replace the position's own amount", async () => {
  const dec = (n: number) => ({ toNumber: () => n });
  const { positionContributions } = await import("../src/lib/vehicle/cap-table-compute.ts");
  // Edited per startup: the older amount on the position no longer counts.
  assert.deepEqual(
    positionContributions({ commitmentAmount: dec(8000), currency: "USD", startupExposures: [{ investedAmount: dec(9161.5), currency: "USD" }] }),
    [{ amount: 9161.5, currency: "USD" }]
  );
  // Several startups, and one in another currency.
  assert.deepEqual(
    positionContributions({
      commitmentAmount: null,
      currency: "USD",
      startupExposures: [
        { investedAmount: dec(100), currency: "USD" },
        { investedAmount: dec(375), currency: "SAR" },
        { investedAmount: null, currency: null },
      ],
    }),
    [{ amount: 100, currency: "USD" }, { amount: 375, currency: "SAR" }]
  );
  // Nothing per startup: the position's amount, or nothing at all.
  assert.deepEqual(positionContributions({ commitmentAmount: dec(25000), currency: "USD", startupExposures: [{ investedAmount: null, currency: null }] }), [{ amount: 25000, currency: "USD" }]);
  assert.deepEqual(positionContributions({ commitmentAmount: null, currency: "USD", startupExposures: [] }), []);
});
