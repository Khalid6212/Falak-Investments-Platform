import { test } from "node:test";
import assert from "node:assert/strict";
import { setCurrentUser, setDbStub, makeAdminActionDbStub, REAL_USER } from "./support/stubs.ts";

// Imports the REAL production module via tests/support/mock-loader.mjs.
const { archiveReportingCycleAction, restoreReportingCycleAction, deleteReportingCycleAction } = await import("../src/app/admin/actions.ts");

const ADMIN_ROLE = [{ role: "FALAK_ADMIN" }];
const OPERATIONS_ROLE = [{ role: "FALAK_OPERATIONS" }];

function makeStub(options: { falakRoles?: { role: string }[]; published?: boolean; userDepartment?: string; deletedAt?: Date | null }) {
  const updates: Record<string, unknown>[] = [];
  const stub = makeAdminActionDbStub({
    falakRoles: options.falakRoles ?? ADMIN_ROLE,
    models: {
      user: { findUnique: async () => ({ department: options.userDepartment ?? "InvestmentDepartment", allDepartments: false }) },
      reportingCycle: {
        findUnique: async () => ({
          id: "cy_1",
          companyId: "co_1",
          periodStart: new Date("2026-07-01"),
          periodEnd: new Date("2026-09-30"),
          archivedAt: null,
          deletedAt: options.deletedAt ?? null,
          company: { nameEn: "Estaie", department: "InvestmentDepartment" },
        }),
        update: async ({ data }: { data: Record<string, unknown> }) => {
          updates.push(data);
          return data;
        },
      },
      report: { findFirst: async () => (options.published ? { id: "rep_1" } : null) },
    },
  });
  return { stub, updates };
}

function form(fields: Record<string, string>) {
  const data = new FormData();
  data.set("cycleId", "cy_1");
  for (const [k, v] of Object.entries(fields)) data.set(k, v);
  return data;
}

test("an investment professional can archive a cycle in their department, and it is audited", async () => {
  setCurrentUser(REAL_USER);
  const { stub, updates } = makeStub({ falakRoles: OPERATIONS_ROLE });
  setDbStub(stub);
  const result = await archiveReportingCycleAction({ error: null }, form({}));
  assert.equal(result.success, true);
  assert.ok(updates[0].archivedAt instanceof Date);
  assert.equal(stub.getAuditEvents()[0].action, "reporting_cycle.archived");
});

test("an investment professional can't archive a cycle outside their department", async () => {
  setCurrentUser(REAL_USER);
  const { stub, updates } = makeStub({ falakRoles: OPERATIONS_ROLE, userDepartment: "OtherDepartment" });
  setDbStub(stub);
  const result = await archiveReportingCycleAction({ error: null }, form({}));
  assert.ok(result.error);
  assert.equal(updates.length, 0);
});

test("restoring clears the archive date", async () => {
  setCurrentUser(REAL_USER);
  const { stub, updates } = makeStub({ falakRoles: OPERATIONS_ROLE });
  setDbStub(stub);
  const result = await restoreReportingCycleAction({ error: null }, form({}));
  assert.equal(result.success, true);
  assert.equal(updates[0].archivedAt, null);
  assert.equal(stub.getAuditEvents()[0].action, "reporting_cycle.restored");
});

test("an investment professional can't delete a cycle", async () => {
  setCurrentUser(REAL_USER);
  const { stub, updates } = makeStub({ falakRoles: OPERATIONS_ROLE });
  setDbStub(stub);
  const result = await deleteReportingCycleAction({ error: null }, form({ confirmName: "Estaie" }));
  assert.ok(result.error);
  assert.equal(updates.length, 0);
});

test("an admin deletes a cycle by typing the startup's name, which frees the request to be sent again", async () => {
  setCurrentUser(REAL_USER);
  const { stub, updates } = makeStub({});
  setDbStub(stub);

  const wrong = await deleteReportingCycleAction({ error: null }, form({ confirmName: "Bookr" }));
  assert.ok(wrong.fieldErrors?.confirmName);
  assert.equal(updates.length, 0);

  const result = await deleteReportingCycleAction({ error: null }, form({ confirmName: "Estaie" }));
  assert.equal(result.success, true);
  assert.ok(updates[0].deletedAt instanceof Date);
  assert.ok(updates[0].archivedAt instanceof Date);
  assert.equal(updates[0].deletedKey, "cy_1");
  assert.equal(stub.getAuditEvents()[0].action, "reporting_cycle.deleted");
});

test("a report published to investors can be neither archived nor deleted", async () => {
  setCurrentUser(REAL_USER);
  const { stub, updates } = makeStub({ published: true });
  setDbStub(stub);
  assert.ok((await archiveReportingCycleAction({ error: null }, form({}))).error);
  assert.ok((await deleteReportingCycleAction({ error: null }, form({ confirmName: "Estaie" }))).error);
  assert.equal(updates.length, 0);
});

test("a deleted cycle can't be restored", async () => {
  setCurrentUser(REAL_USER);
  const { stub, updates } = makeStub({ deletedAt: new Date() });
  setDbStub(stub);
  assert.ok((await restoreReportingCycleAction({ error: null }, form({}))).error);
  assert.equal(updates.length, 0);
});
