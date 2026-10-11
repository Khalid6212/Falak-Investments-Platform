import { test } from "node:test";
import assert from "node:assert/strict";
import { setCurrentUser, setDbStub, REAL_USER } from "./support/stubs.ts";

// Imports the REAL production module via tests/support/mock-loader.mjs.
const { getInvestorVehicleAssignments } = await import("../src/lib/admin/investor-vehicle-assignments.ts");
const { ForbiddenError } = await import("../src/lib/auth/authorization-errors.ts");

const ADMIN_ROLE = [{ role: "FALAK_OPERATIONS" }];

function makeStub(options: { falakRoles?: typeof ADMIN_ROLE; positions?: Record<string, unknown>[] }) {
  return {
    userRoleAssignment: {
      findMany: async ({ where }: { where: Record<string, unknown> }) => {
        const roleFilter = where.role as { in: string[] };
        return (options.falakRoles ?? []).filter((r) => roleFilter.in.includes(r.role)).map((r) => ({ role: r.role }));
      },
    },
    investorVehiclePosition: {
      findMany: async () => options.positions ?? [],
    },
  };
}

const BASE_POSITION = {
  id: "pos_1",
  currency: "SAR",
  commitmentAmount: { toNumber: () => 5000000 },
  ownershipPct: { toNumber: () => 0.1 },
  effectiveFrom: new Date("2026-01-01"),
  exposureScope: "SELECTED",
  _count: { startupExposures: 2 },
  investor: { id: "inv_1", nameEn: "Acme Capital", nameAr: "Acme AR" },
  vehicle: { id: "veh_1", nameEn: "Fund I", nameAr: "Fund I AR" },
};

test("denies a caller with no Falak role", async () => {
  setCurrentUser(REAL_USER);
  setDbStub(makeStub({ falakRoles: [] }));
  await assert.rejects(() => getInvestorVehicleAssignments(), ForbiddenError);
});

test("no positions -> empty array, no throw", async () => {
  setCurrentUser(REAL_USER);
  setDbStub(makeStub({ falakRoles: ADMIN_ROLE, positions: [] }));
  const result = await getInvestorVehicleAssignments();
  assert.deepEqual(result, []);
});

test("maps a position to its investor/vehicle names and converts Decimal fields to numbers", async () => {
  setCurrentUser(REAL_USER);
  setDbStub(makeStub({ falakRoles: ADMIN_ROLE, positions: [BASE_POSITION] }));
  const result = await getInvestorVehicleAssignments();
  assert.equal(result.length, 1);
  assert.equal(result[0].investorNameEn, "Acme Capital");
  assert.equal(result[0].vehicleNameEn, "Fund I");
  assert.equal(result[0].commitmentAmount, 5000000);
  assert.equal(result[0].ownershipPct, 0.1);
  assert.equal(result[0].effectiveFrom, "2026-01-01");
  assert.equal(result[0].exposureScope, "SELECTED");
  assert.equal(result[0].exposedStartupCount, 2);
});

test("a position with no commitment/ownership recorded yet maps those to null, not 0", async () => {
  setCurrentUser(REAL_USER);
  const position = { ...BASE_POSITION, commitmentAmount: null, ownershipPct: null };
  setDbStub(makeStub({ falakRoles: ADMIN_ROLE, positions: [position] }));
  const result = await getInvestorVehicleAssignments();
  assert.equal(result[0].commitmentAmount, null);
  assert.equal(result[0].ownershipPct, null);
});
