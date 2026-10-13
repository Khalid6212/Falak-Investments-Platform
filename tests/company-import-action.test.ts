import { test } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { setCurrentUser, setDbStub, makeAdminActionDbStub, REAL_USER } from "./support/stubs.ts";

// Imports the REAL production modules via tests/support/mock-loader.mjs.
const { buildCompanyImportTemplate } = await import("../src/lib/admin/company-import.ts");
const { importCompaniesAction } = await import("../src/app/admin/manage/new-company/import-actions.ts");
const { importConfirmName } = await import("../src/lib/admin/import-confirm.ts");
const actions = await import("../src/app/admin/actions.ts");

const EXISTING = {
  id: "co_1",
  slug: "existing-co",
  nameEn: "Existing Co",
  nameAr: "الشركة الحالية",
  sectorEn: "Healthtech",
  sectorAr: "التقنية الصحية",
  customerModel: "B2B",
  revenueModels: ["SaaS"],
  currency: "USD",
  entryStage: "PreSeed",
  currentStage: "Seed",
  department: "InvestmentDepartment",
  founderName: null,
  founderEmail: null,
  founderPhone: null,
  hqCity: "Riyadh",
  hqCountry: "SA",
  website: null,
  archivedAt: null,
  deletedAt: null,
};

async function importForm(rows: Record<string, string>[], mode: "preview" | "import", ticks: string[] = []): Promise<FormData> {
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(await buildCompanyImportTemplate());
  const sheet = book.getWorksheet("Startups")!;
  const col: Record<string, number> = {};
  sheet.getRow(1).eachCell((cell, c) => (col[cell.text.replace(" *", "")] = c));
  rows.forEach((row, i) => {
    for (const [header, value] of Object.entries(row)) sheet.getCell(i + 2, col[header]).value = value;
  });
  const fd = new FormData();
  fd.set("file", new File([await book.xlsx.writeBuffer()], "startups.xlsx"));
  fd.set("mode", mode);
  for (const t of ticks) fd.set(t, "on");
  return fd;
}

function makeStub() {
  const updates: { where: { id: string }; data: Record<string, unknown> }[] = [];
  const created: Record<string, unknown>[] = [];
  const db = makeAdminActionDbStub({
    falakRoles: [{ role: "FALAK_ADMIN" }],
    models: {
      company: {
        findMany: async () => [EXISTING],
        update: async (args: { where: { id: string }; data: Record<string, unknown> }) => {
          updates.push(args);
          return {};
        },
        create: async ({ data }: { data: Record<string, unknown> }) => {
          created.push(data);
          return { id: "co_new", ...data };
        },
      },
    },
  });
  return { db, updates, created };
}

const ROWS = [{ "Name (English)": "Existing Co", Website: "www.existing.co", "Current stage": "Series A" }];

test("import action: Check file changes nothing and reports the fill and the change to confirm", async () => {
  setCurrentUser(REAL_USER);
  const s = makeStub();
  setDbStub(s.db);
  const result = await importCompaniesAction({ error: null }, await importForm(ROWS, "preview"));
  assert.equal(result.error, null);
  assert.equal(result.readyCount, 1);
  assert.equal(result.rows![0].kind, "update");
  assert.deepEqual(result.rows![0].fills.map((f) => f.field), ["website"]);
  assert.deepEqual(result.rows![0].changes.map((c) => c.field), ["currentStage"]);
  assert.equal(s.updates.length, 0);
});

test("import action: fills apply on their own; an unticked change is left alone; the old details are backed up", async () => {
  setCurrentUser(REAL_USER);
  const s = makeStub();
  setDbStub(s.db);
  const result = await importCompaniesAction({ error: null }, await importForm(ROWS, "import"));
  assert.equal(result.success, true);
  assert.equal(result.updatedCount, 1);
  assert.deepEqual(s.updates, [{ where: { id: "co_1" }, data: { website: "https://www.existing.co" } }]);
  const event = s.db.getAuditEvents().find((e) => e.action === "company.updated")!;
  const meta = event.meta as { source: string; fields: string[]; before: Record<string, unknown> };
  assert.equal(meta.source, "excel_import");
  assert.deepEqual(meta.fields, ["website"]);
  assert.equal(meta.before.website, null);
  assert.equal(meta.before.currentStage, "Seed");
});

test("import action: a ticked change is applied together with the fills", async () => {
  setCurrentUser(REAL_USER);
  const s = makeStub();
  setDbStub(s.db);
  await importCompaniesAction({ error: null }, await importForm(ROWS, "import", [importConfirmName("co_1", "currentStage")]));
  assert.deepEqual(s.updates[0].data, { website: "https://www.existing.co", currentStage: "SeriesA" });
});

test("restore: puts a backed-up version back, backs up the current details first, and never touches the link name", async () => {
  setCurrentUser(REAL_USER);
  const updates: Record<string, unknown>[] = [];
  const current = { ...EXISTING, website: "https://www.existing.co", currentStage: "SeriesA" };
  const db = makeAdminActionDbStub({
    falakRoles: [{ role: "FALAK_ADMIN" }],
    models: {
      auditEvent: {
        findUnique: async () => ({
          targetType: "Company",
          targetId: "co_1",
          action: "company.updated",
          createdAt: new Date(),
          meta: { source: "excel_import", before: { website: null, currentStage: "Seed", slug: "tampered" } },
        }),
        create: async ({ data }: { data: Record<string, unknown> }) => {
          restoredEvents.push(data);
          return data;
        },
      },
      company: {
        findUnique: async () => current,
        update: async ({ data }: { data: Record<string, unknown> }) => {
          updates.push(data);
          return {};
        },
      },
    },
  });
  const restoredEvents: Record<string, unknown>[] = [];
  setDbStub(db);
  const fd = new FormData();
  fd.set("backupId", "evt_1");
  const result = await actions.restoreCompanyBackupAction({ error: null }, fd);
  assert.equal(result.success, true);
  assert.deepEqual(updates, [{ website: null, currentStage: "Seed" }]);
  const meta = restoredEvents[0].meta as { before: Record<string, unknown> };
  assert.equal(restoredEvents[0].action, "company.restored");
  assert.equal(meta.before.website, "https://www.existing.co", "the replaced details are kept, so a restore can be undone");
});

test("restore: a version older than 90 days, or a non-Admin, is refused", async () => {
  setCurrentUser(REAL_USER);
  const old = new Date(Date.now() - 91 * 24 * 60 * 60 * 1000);
  const dbOld = makeAdminActionDbStub({
    falakRoles: [{ role: "FALAK_ADMIN" }],
    models: {
      auditEvent: { findUnique: async () => ({ targetType: "Company", targetId: "co_1", action: "company.updated", createdAt: old, meta: { before: { website: null } } }) },
    },
  });
  setDbStub(dbOld);
  const fd = new FormData();
  fd.set("backupId", "evt_1");
  assert.match((await actions.restoreCompanyBackupAction({ error: null }, fd)).error ?? "", /no longer available/);

  setDbStub(makeAdminActionDbStub({ falakRoles: [{ role: "FALAK_OPERATIONS" }] }));
  assert.ok((await actions.restoreCompanyBackupAction({ error: null }, fd)).error);
});
