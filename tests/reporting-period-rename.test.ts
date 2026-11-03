import { test } from "node:test";
import assert from "node:assert/strict";
import { setCurrentUser, setDbStub, makeAdminActionDbStub, REAL_USER } from "./support/stubs.ts";

// Imports the REAL production module via tests/support/mock-loader.mjs.
const { renameReportingPeriodAction } = await import("../src/app/admin/actions.ts");

const OPERATIONS_ROLE = [{ role: "FALAK_OPERATIONS" }];

const CYCLES = [
  { id: "cy_1", companyId: "co_1", periodLabel: "Q2", company: { nameEn: "Ballurah" } },
  { id: "cy_2", companyId: "co_2", periodLabel: "Q2 2026", company: { nameEn: "Estaie" } },
];

function makeStub(options: { clash?: boolean; cycles?: typeof CYCLES } = {}) {
  const cycleWheres: Record<string, unknown>[] = [];
  const cycleUpdates: { where: unknown; data: Record<string, unknown> }[] = [];
  const reportUpdates: { where: Record<string, unknown>; data: Record<string, unknown> }[] = [];
  const stub = makeAdminActionDbStub({
    falakRoles: OPERATIONS_ROLE,
    models: {
      user: { findUnique: async () => ({ department: "InvestmentDepartment", allDepartments: false }) },
      reportingCycle: {
        findMany: async ({ where }: { where: Record<string, unknown> }) => {
          cycleWheres.push(where);
          return options.cycles ?? CYCLES;
        },
        findFirst: async () => (options.clash ? { company: { nameEn: "Ballurah" } } : null),
        update: async (args: { where: unknown; data: Record<string, unknown> }) => {
          cycleUpdates.push(args);
          return args.data;
        },
      },
      report: {
        updateMany: async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
          reportUpdates.push(args);
          return { count: 1 };
        },
      },
    },
  });
  return { stub, cycleWheres, cycleUpdates, reportUpdates };
}

function form(periodLabel: string) {
  const data = new FormData();
  data.set("templateId", "tpl_1");
  data.set("periodStart", "2026-04-01");
  data.set("periodEnd", "2026-06-30");
  data.set("periodLabel", periodLabel);
  return data;
}

test("period rename: renames each startup's period and published report, within the caller's department, audited with the old name", async () => {
  setCurrentUser(REAL_USER);
  const { stub, cycleWheres, cycleUpdates, reportUpdates } = makeStub();
  setDbStub(stub);
  const result = await renameReportingPeriodAction({ error: null }, form("  Q2 2026 "));
  assert.equal(result.success, true);
  // Estaie already has the name, so only Ballurah changes.
  assert.deepEqual(cycleUpdates, [{ where: { id: "cy_1" }, data: { periodLabel: "Q2 2026" } }]);
  assert.equal(reportUpdates.length, 1);
  assert.equal(reportUpdates[0].where.companyId, "co_1");
  assert.deepEqual(reportUpdates[0].data, { periodLabel: "Q2 2026" });
  assert.deepEqual((cycleWheres[0].company as Record<string, unknown>).department, { in: ["InvestmentDepartment"] });
  const audit = stub.getAuditEvents();
  assert.equal(audit[0].action, "reporting_cycle.renamed");
  assert.deepEqual(audit[0].meta, { previousLabel: "Q2", newLabel: "Q2 2026" });
});

test("period rename: a name a startup already uses for another period is refused", async () => {
  setCurrentUser(REAL_USER);
  const { stub, cycleUpdates } = makeStub({ clash: true });
  setDbStub(stub);
  const result = await renameReportingPeriodAction({ error: null }, form("Q3 2026"));
  assert.ok(result.fieldErrors?.periodLabel?.includes("Ballurah"));
  assert.equal(cycleUpdates.length, 0);
});

test("period rename: an empty or overlong name is refused", async () => {
  setCurrentUser(REAL_USER);
  for (const name of ["   ", "x".repeat(51)]) {
    const { stub, cycleUpdates } = makeStub();
    setDbStub(stub);
    const result = await renameReportingPeriodAction({ error: null }, form(name));
    assert.ok(result.fieldErrors?.periodLabel, JSON.stringify(name));
    assert.equal(cycleUpdates.length, 0);
  }
});

test("period rename: no startups in the caller's department means nothing changes", async () => {
  setCurrentUser(REAL_USER);
  const { stub, cycleUpdates } = makeStub({ cycles: [] });
  setDbStub(stub);
  const result = await renameReportingPeriodAction({ error: null }, form("Q2 2026"));
  assert.ok(result.error);
  assert.equal(cycleUpdates.length, 0);
});
