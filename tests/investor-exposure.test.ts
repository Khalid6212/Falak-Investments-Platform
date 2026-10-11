import { test } from "node:test";
import assert from "node:assert/strict";
import { setCurrentUser, setDbStub, makeAdminActionDbStub, REAL_USER } from "./support/stubs.ts";

// Imports the REAL production module via tests/support/mock-loader.mjs.
const { saveInvestorExposuresAction } = await import("../src/app/admin/manage/investor-vehicle-assignment/exposure-actions.ts");

const dec = (n: number) => ({ toNumber: () => n });

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

function makeStub(options: {
  falakRoles?: { role: string }[];
  scope?: "ALL_STARTUPS" | "SELECTED";
  current?: { id: string; companyId: string; investedAmount: number | null; currency: string | null; participation: string | null }[];
}) {
  const created: Record<string, unknown>[] = [];
  const ended: string[] = [];
  const scopeUpdates: Record<string, unknown>[] = [];
  const grants: Record<string, unknown>[] = [];
  const db = makeAdminActionDbStub({
    falakRoles: options.falakRoles ?? [{ role: "FALAK_ADMIN" }],
    models: {
      investorVehiclePosition: {
        findFirst: async () => ({
          id: "pos_1",
          investorId: "inv_1",
          vehicleId: "veh_1",
          exposureScope: options.scope ?? "SELECTED",
          investor: { department: "InvestmentDepartment" },
          vehicle: { department: "InvestmentDepartment" },
          startupExposures: (options.current ?? []).map((e) => ({
            ...e,
            investedAmount: e.investedAmount === null ? null : dec(e.investedAmount),
            ownershipPct: null,
          })),
        }),
        update: async ({ data }: { data: Record<string, unknown> }) => {
          scopeUpdates.push(data);
          return {};
        },
      },
      ownershipPosition: { findMany: async () => [{ companyId: "co_1" }, { companyId: "co_2" }] },
      investorStartupExposure: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          created.push(data);
          return data;
        },
        update: async ({ where }: { where: { id: string } }) => {
          ended.push(where.id);
          return {};
        },
      },
      reportVersion: { findMany: async () => [{ id: "ver_1" }] },
      reportAccessGrant: {
        upsert: async ({ create }: { create: Record<string, unknown> }) => {
          grants.push(create);
          return create;
        },
      },
    },
  });
  return { db, created, ended, scopeUpdates, grants };
}

test("exposure: ticking a startup creates its exposure with amount and label, and shares its past reports", async () => {
  setCurrentUser(REAL_USER);
  const s = makeStub({ scope: "SELECTED" });
  setDbStub(s.db);
  const result = await saveInvestorExposuresAction(
    "pos_1",
    { error: null },
    form({ exposureScope: "SELECTED", include_co_2: "on", amount_co_2: "50,000", currency_co_2: "USD", participation_co_2: "SYNDICATE_MEMBER" })
  );
  assert.equal(result.success, true);
  assert.equal(s.created.length, 1);
  assert.equal(s.created[0].companyId, "co_2");
  assert.equal(s.created[0].investedAmount, "50000");
  assert.equal(s.created[0].participation, "SYNDICATE_MEMBER");
  assert.deepEqual(s.grants, [{ reportVersionId: "ver_1", investorId: "inv_1" }]);
  assert.ok(s.db.getAuditEvents().some((e) => e.action === "investor_exposure.updated"));
});

test("exposure: changing terms ends the old row and adds a new one; unticking ends it", async () => {
  setCurrentUser(REAL_USER);
  const s = makeStub({
    scope: "SELECTED",
    current: [
      { id: "exp_1", companyId: "co_1", investedAmount: 10000, currency: "USD", participation: "NETWORK_MEMBER" },
      { id: "exp_2", companyId: "co_2", investedAmount: 5000, currency: "USD", participation: null },
    ],
  });
  setDbStub(s.db);
  const result = await saveInvestorExposuresAction(
    "pos_1",
    { error: null },
    // co_1 kept with a new amount; co_2 unticked.
    form({ exposureScope: "SELECTED", include_co_1: "on", amount_co_1: "12000", currency_co_1: "USD", participation_co_1: "NETWORK_MEMBER" })
  );
  assert.equal(result.success, true);
  assert.deepEqual(s.ended.sort(), ["exp_1", "exp_2"]);
  assert.equal(s.created.length, 1);
  assert.equal(s.created[0].investedAmount, "12000");
  assert.equal(s.grants.length, 0, "co_1 was already exposed; no new sharing");
});

test("exposure: an unchanged startup is left alone", async () => {
  setCurrentUser(REAL_USER);
  const s = makeStub({
    scope: "SELECTED",
    current: [{ id: "exp_1", companyId: "co_1", investedAmount: 10000, currency: "USD", participation: "NETWORK_MEMBER" }],
  });
  setDbStub(s.db);
  await saveInvestorExposuresAction(
    "pos_1",
    { error: null },
    form({ exposureScope: "SELECTED", include_co_1: "on", amount_co_1: "10000", currency_co_1: "USD", participation_co_1: "NETWORK_MEMBER" })
  );
  assert.deepEqual(s.ended, []);
  assert.equal(s.created.length, 0);
});

test("exposure: switching to all startups updates the scope and shares every startup's reports", async () => {
  setCurrentUser(REAL_USER);
  const s = makeStub({ scope: "SELECTED" });
  setDbStub(s.db);
  const result = await saveInvestorExposuresAction("pos_1", { error: null }, form({ exposureScope: "ALL_STARTUPS" }));
  assert.equal(result.success, true);
  assert.deepEqual(s.scopeUpdates, [{ exposureScope: "ALL_STARTUPS" }]);
  assert.equal(s.created.length, 0, "no detail entered, so no startup rows");
  assert.equal(s.grants.length, 1);
});

test("exposure: a bad amount is highlighted and nothing is written", async () => {
  setCurrentUser(REAL_USER);
  const s = makeStub({ scope: "SELECTED" });
  setDbStub(s.db);
  const result = await saveInvestorExposuresAction(
    "pos_1",
    { error: null },
    form({ exposureScope: "SELECTED", include_co_1: "on", amount_co_1: "lots", currency_co_1: "USD" })
  );
  assert.ok(result.fieldErrors?.amount_co_1);
  assert.equal(s.created.length, 0);
  assert.deepEqual(s.ended, []);
});

test("exposure: a caller with no staff role is refused", async () => {
  setCurrentUser(REAL_USER);
  const s = makeStub({ falakRoles: [] });
  setDbStub(s.db);
  const result = await saveInvestorExposuresAction("pos_1", { error: null }, form({ exposureScope: "SELECTED" }));
  assert.ok(result.error);
  assert.equal(s.created.length, 0);
});
