import { test } from "node:test";
import assert from "node:assert/strict";
import { setCurrentUser, setDbStub, makeAdminActionDbStub, REAL_USER } from "./support/stubs.ts";

const actions = await import("../src/app/admin/actions.ts");
const { GENERIC_ACCESS_DENIED } = await import("../src/lib/auth/action-error.ts");
const { MockRedirectError } = (await import("next/navigation")) as unknown as {
  MockRedirectError: new (url: string) => Error & { url: string };
};

const OPS = [{ role: "FALAK_OPERATIONS" }];
const ADMIN = [{ role: "FALAK_ADMIN" }];

/** A db stub where every model call is recorded; unknown models return empty results. */
function recordingDb(falakRoles: { role: string }[], overrides: Record<string, Record<string, (...args: never[]) => unknown>> = {}) {
  const calls: string[] = [];
  const base = makeAdminActionDbStub({ falakRoles, models: overrides }) as unknown as Record<string, unknown>;
  const passThrough = new Set(["userRoleAssignment", "user", "getAuditEvents", "$transaction"]);
  const db: Record<string, unknown> = new Proxy(base, {
    get(target, model: string) {
      if (passThrough.has(model)) return target[model];
      const real = (target[model] ?? {}) as Record<string, unknown>;
      return new Proxy(real, {
        get(inner, method: string) {
          return async (...args: unknown[]) => {
            calls.push(`${model}.${method}`);
            const fn = inner[method];
            if (typeof fn === "function") return (fn as (...a: unknown[]) => unknown)(...args);
            return method === "findMany" ? [] : { count: 0 };
          };
        },
      });
    },
  });
  base.$transaction = async (fn: (tx: unknown) => Promise<unknown>) => fn(db);
  return { db, calls };
}

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

const isRedirectTo = (url: string) => (e: unknown) => e instanceof MockRedirectError && e.url === url;

test("delete startup: hides it (deleted + archived, slug freed), ends its access, removes no rows", async () => {
  setCurrentUser(REAL_USER);
  const updates: { data: Record<string, unknown> }[] = [];
  const { db, calls } = recordingDb(ADMIN, {
    company: {
      findUnique: async () => ({ nameEn: "Startup X", slug: "startup-x", department: "InvestmentDepartment", archivedAt: null, deletedAt: null }),
      update: async (args: { data: Record<string, unknown> }) => {
        updates.push(args);
        return {};
      },
    },
  });
  setDbStub(db);
  await assert.rejects(
    () => actions.deleteCompanyAction({ error: null }, form({ companyId: "co_1", confirmName: "Startup X" })),
    isRedirectTo("/admin/manage/new-company")
  );
  const data = updates[0].data;
  assert.ok(data.deletedAt instanceof Date);
  assert.ok(data.archivedAt instanceof Date);
  assert.match(String(data.slug), /^startup-x-deleted-/);
  assert.ok(calls.includes("companyMembership.updateMany"), "logins revoked");
  assert.ok(calls.includes("companyInvite.updateMany"), "pending invites revoked");
  assert.ok(calls.includes("auditEvent.create"));
  assert.ok(!calls.some((c) => c.endsWith(".delete") || c.endsWith(".deleteMany")), "no rows removed");
});

test("delete startup: Admin only -- refused for other staff, even in their own department", async () => {
  setCurrentUser(REAL_USER);
  const { db, calls } = recordingDb(OPS, {
    company: { findUnique: async () => ({ nameEn: "Startup X", slug: "startup-x", department: "InvestmentDepartment", archivedAt: null, deletedAt: null }) },
  });
  setDbStub(db);
  const result = await actions.deleteCompanyAction({ error: null }, form({ companyId: "co_1", confirmName: "Startup X" }));
  assert.equal(result.error, GENERIC_ACCESS_DENIED);
  assert.ok(!calls.some((c) => c.endsWith(".update") || c.endsWith(".updateMany")), "nothing changed");
});

test("delete startup: refused when the typed name does not match", async () => {
  setCurrentUser(REAL_USER);
  const { db, calls } = recordingDb(ADMIN, {
    company: { findUnique: async () => ({ nameEn: "Startup X", slug: "startup-x", department: "InvestmentDepartment", archivedAt: null, deletedAt: null }) },
  });
  setDbStub(db);
  const result = await actions.deleteCompanyAction({ error: null }, form({ companyId: "co_1", confirmName: "startup x" }));
  assert.ok(result.fieldErrors?.confirmName);
  assert.ok(!calls.some((c) => c.endsWith(".update") || c.endsWith(".updateMany")), "nothing changed");
});

test("delete investor: Admin only; hides it, ends its access and positions, removes no rows", async () => {
  setCurrentUser(REAL_USER);
  const ops = recordingDb(OPS);
  setDbStub(ops.db);
  const denied = await actions.deleteInvestorAction({ error: null }, form({ investorId: "inv_1", confirmName: "Investor A" }));
  assert.equal(denied.error, GENERIC_ACCESS_DENIED);

  const updates: { data: Record<string, unknown> }[] = [];
  const positionUpdates: { where: Record<string, unknown>; data: Record<string, unknown> }[] = [];
  const admin = recordingDb(ADMIN, {
    investor: {
      findUnique: async () => ({ nameEn: "Investor A", archivedAt: null, deletedAt: null }),
      update: async (args: { data: Record<string, unknown> }) => {
        updates.push(args);
        return {};
      },
    },
    investorVehiclePosition: {
      updateMany: async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        positionUpdates.push(args);
        return { count: 1 };
      },
    },
  });
  setDbStub(admin.db);
  await assert.rejects(
    () => actions.deleteInvestorAction({ error: null }, form({ investorId: "inv_1", confirmName: "Investor A" })),
    isRedirectTo("/admin/manage/new-investor")
  );
  assert.ok(updates[0].data.deletedAt instanceof Date);
  assert.ok(updates[0].data.archivedAt instanceof Date);
  assert.ok(admin.calls.includes("investorMembership.updateMany"), "logins revoked");
  assert.ok(admin.calls.includes("investorInvite.updateMany"), "pending invites revoked");
  assert.equal(positionUpdates[0].data.status, "Exited");
  assert.ok(admin.calls.includes("auditEvent.create"));
  assert.ok(!admin.calls.some((c) => c.endsWith(".delete") || c.endsWith(".deleteMany")), "no rows removed");
});

test("delete vehicle: Admin only; hides it without removing rows", async () => {
  setCurrentUser(REAL_USER);
  const ops = recordingDb(OPS);
  setDbStub(ops.db);
  const denied = await actions.deleteVehicleAction({ error: null }, form({ vehicleId: "veh_1", confirmName: "Fund" }));
  assert.equal(denied.error, GENERIC_ACCESS_DENIED);

  const updates: { data: Record<string, unknown> }[] = [];
  const admin = recordingDb(ADMIN, {
    vehicle: {
      findUnique: async () => ({ nameEn: "Fund", slug: "fund", archivedAt: null, deletedAt: null }),
      update: async (args: { data: Record<string, unknown> }) => {
        updates.push(args);
        return {};
      },
    },
  });
  setDbStub(admin.db);
  await assert.rejects(
    () => actions.deleteVehicleAction({ error: null }, form({ vehicleId: "veh_1", confirmName: "Fund" })),
    isRedirectTo("/admin/manage/new-vehicle")
  );
  assert.ok(updates[0].data.deletedAt instanceof Date);
  assert.ok(!admin.calls.some((c) => c.endsWith(".delete") || c.endsWith(".deleteMany")), "no rows removed");
});

test("templates: an Investment Professional can create one", async () => {
  setCurrentUser(REAL_USER);
  setDbStub(
    makeAdminActionDbStub({
      falakRoles: OPS,
      models: {
        reportingTemplate: { create: async () => ({ id: "t_new" }) },
        metricDefinition: { createMany: async () => ({ count: 1 }) },
      },
    })
  );
  const result = await actions.createReportingTemplateAction(
    { error: null },
    form({ nameEn: "Quarterly", nameAr: "ربع سنوي", metricKey_0: "revenue_b2b", metricLabelEn_0: "Revenue", metricLabelAr_0: "الإيرادات", metricDataType_0: "Currency" })
  );
  assert.equal(result.error, null);
});

test("templates: editing keeps a locked metric's key and data type, and applies the rest", async () => {
  setCurrentUser(REAL_USER);
  const updates: { where: { id: string }; data: Record<string, unknown> }[] = [];
  let created: unknown[] = [];
  setDbStub(
    makeAdminActionDbStub({
      falakRoles: OPS,
      models: {
        metricDefinition: {
          findMany: async (args?: { where?: { deletedAt?: unknown } }) => args?.where?.deletedAt ? [] : [
            { id: "m1", key: "revenue_b2b", dataType: "Currency", sortOrder: 1, labelEn: "Revenue", _count: { currentValues: 3, snapshotValues: 0 } },
            { id: "m2", key: "old_key", dataType: "Number", sortOrder: 2, labelEn: "Old", _count: { currentValues: 0, snapshotValues: 0 } },
          ],
          update: async (args: { where: { id: string }; data: Record<string, unknown> }) => {
            updates.push(args);
            return {};
          },
          createMany: async ({ data }: { data: unknown[] }) => {
            created = data;
            return { count: data.length };
          },
        },
        reportingTemplate: { update: async () => ({}) },
      },
    })
  );
  const result = await actions.updateReportingTemplateAction(
    { error: null },
    form({
      templateId: "t1",
      nameEn: "Quarterly",
      nameAr: "ربع سنوي",
      templateActive: "on",
      key_m1: "tampered_key",
      dataType_m1: "Text",
      labelEn_m1: "Total Revenue",
      labelAr_m1: "الإيرادات",
      sortOrder_m1: "1",
      isActive_m1: "on",
      key_m2: "new_key",
      dataType_m2: "Percent",
      labelEn_m2: "Renamed",
      labelAr_m2: "معدل",
      sortOrder_m2: "2",
      newKey_0: "cust_nps",
      newLabelEn_0: "NPS",
      newLabelAr_0: "صافي نقاط الترويج",
      newDataType_0: "Number",
    })
  );
  assert.equal(result.error, null);
  const m1 = updates.filter((u) => u.where.id === "m1").at(-1)!.data;
  assert.equal(m1.labelEn, "Total Revenue");
  assert.equal("key" in m1, false, "locked key untouched");
  assert.equal("dataType" in m1, false, "locked data type untouched");
  const m2 = updates.filter((u) => u.where.id === "m2").at(-1)!.data;
  assert.equal(m2.key, "new_key");
  assert.equal(m2.dataType, "Percent");
  assert.equal(m2.isActive, false, "unticked means hidden");
  assert.equal(created.length, 1);
});

test("templates: a duplicate metric key is refused and the submitted values come back", async () => {
  setCurrentUser(REAL_USER);
  setDbStub(
    makeAdminActionDbStub({
      falakRoles: OPS,
      models: {
        metricDefinition: {
          findMany: async (args?: { where?: { deletedAt?: unknown } }) => args?.where?.deletedAt ? [] : [
            { id: "m1", key: "revenue_b2b", dataType: "Currency", sortOrder: 1, labelEn: "Revenue", _count: { currentValues: 1, snapshotValues: 0 } },
          ],
        },
      },
    })
  );
  const result = await actions.updateReportingTemplateAction(
    { error: null },
    form({
      templateId: "t1",
      nameEn: "Quarterly",
      nameAr: "ربع سنوي",
      labelEn_m1: "Revenue",
      labelAr_m1: "الإيرادات",
      sortOrder_m1: "1",
      newKey_0: "revenue_b2b",
      newLabelEn_0: "Dup",
      newLabelAr_0: "مكرر",
      newDataType_0: "Number",
    })
  );
  assert.match(result.fieldErrors?.newKey_0 ?? "", /used by another metric/);
  assert.equal(result.values?.newLabelEn_0, "Dup");
});

test("templates: deleting metrics hides them; an unused one frees its key, a used one keeps it", async () => {
  setCurrentUser(REAL_USER);
  const updates: { where: { id: string }; data: Record<string, unknown> }[] = [];
  setDbStub(
    makeAdminActionDbStub({
      falakRoles: OPS,
      models: {
        metricDefinition: {
          findMany: async (args?: { where?: { deletedAt?: unknown } }) => args?.where?.deletedAt ? [] : [
            { id: "m1", key: "revenue_b2b", dataType: "Currency", sortOrder: 1, labelEn: "Revenue", _count: { currentValues: 2, snapshotValues: 0 } },
            { id: "m2", key: "", dataType: "Number", sortOrder: 0, labelEn: "", _count: { currentValues: 0, snapshotValues: 0 } },
            { id: "m3", key: "burn_rate", dataType: "Percent", sortOrder: 2, labelEn: "Burn", _count: { currentValues: 0, snapshotValues: 0 } },
          ],
          update: async (args: { where: { id: string }; data: Record<string, unknown> }) => {
            updates.push(args);
            return {};
          },
        },
        reportingTemplate: { update: async () => ({}) },
      },
    })
  );
  const result = await actions.updateReportingTemplateAction(
    { error: null },
    form({
      templateId: "t1",
      nameEn: "BookHospi",
      nameAr: "بوك هوسبي",
      // m1 (has values) and m2 (blank, never answered) are deleted;
      // their other fields are not validated.
      delete_m1: "on",
      delete_m2: "on",
      key_m3: "burn_rate",
      dataType_m3: "Percent",
      labelEn_m3: "Burn",
      labelAr_m3: "الحرق",
      sortOrder_m3: "2",
      isActive_m3: "on",
    })
  );
  assert.equal(result.error, null);
  const last = (id: string) => updates.filter((u) => u.where.id === id).at(-1)!.data;
  assert.ok(last("m1").deletedAt instanceof Date);
  assert.equal(last("m1").isActive, false);
  assert.equal("key" in last("m1"), false, "a used metric keeps its key");
  assert.ok(last("m2").deletedAt instanceof Date);
  assert.match(String(last("m2").key), /__deleted_/, "an unused metric frees its key");
  assert.equal(last("m3").deletedAt, undefined);
});

test("templates: a key belonging to a deleted metric can't be reused", async () => {
  setCurrentUser(REAL_USER);
  setDbStub(
    makeAdminActionDbStub({
      falakRoles: OPS,
      models: {
        metricDefinition: {
          findMany: async (args?: { where?: { deletedAt?: unknown } }) =>
            args?.where?.deletedAt ? [{ key: "revenue_b2b" }] : [],
        },
        reportingTemplate: { findUnique: async () => ({ id: "t1" }), update: async () => ({}) },
      },
    })
  );
  const result = await actions.updateReportingTemplateAction(
    { error: null },
    form({
      templateId: "t1",
      nameEn: "Quarterly",
      nameAr: "ربع سنوي",
      newKey_0: "revenue_b2b",
      newLabelEn_0: "Revenue",
      newLabelAr_0: "الإيرادات",
      newDataType_0: "Currency",
    })
  );
  assert.match(result.fieldErrors?.newKey_0 ?? "", /deleted metric/);
});

test("investments: Remove ends one (Terminated) and is Admin only", async () => {
  setCurrentUser(REAL_USER);
  const ops = recordingDb(OPS);
  setDbStub(ops.db);
  const denied = await actions.removeInvestmentAction({ error: null }, form({ agreementId: "agr_1" }));
  assert.equal(denied.error, GENERIC_ACCESS_DENIED);

  const updates: { where: Record<string, unknown>; data: Record<string, unknown> }[] = [];
  const admin = recordingDb(ADMIN, {
    investmentAgreement: {
      updateMany: async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        updates.push(args);
        return { count: 1 };
      },
    },
  });
  setDbStub(admin.db);
  const result = await actions.removeInvestmentAction({ error: null }, form({ agreementId: "agr_1" }));
  assert.equal(result.success, true);
  assert.equal(updates[0].data.status, "Terminated");
  assert.ok(admin.calls.includes("auditEvent.create"));
  assert.ok(!admin.calls.some((c) => c.endsWith(".delete") || c.endsWith(".deleteMany")), "no rows removed");
});

test("investments: Correct ends the old record and saves the corrected terms as a new one that supersedes it", async () => {
  setCurrentUser(REAL_USER);
  const created: Record<string, unknown>[] = [];
  const ended: Record<string, unknown>[] = [];
  const admin = recordingDb(ADMIN, {
    investmentAgreement: {
      findFirst: async () => ({ id: "agr_old", agreementNumber: "thakaa-fund-1", ownershipPositionId: "pos_1", roundLabel: null }),
      updateMany: async (args: { data: Record<string, unknown> }) => {
        ended.push(args.data);
        return { count: 1 };
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        created.push(data);
        return { id: "agr_new", ...data };
      },
    },
  });
  setDbStub(admin.db);
  const result = await actions.correctInvestmentAction(
    { error: null },
    form({ agreementId: "agr_old", investedAmount: "125,969.85", currency: "USD", signedDate: "2024-01-01", ownershipPct: "" })
  );
  assert.equal(result.success, true);
  assert.equal(ended[0].status, "Terminated");
  assert.equal(created[0].investedAmount, "125969.85");
  assert.equal(created[0].supersedesAgreementId, "agr_old");
  assert.equal(created[0].ownershipPct, null);
  assert.equal(created[0].status, "Active");
  assert.ok(!admin.calls.includes("ownershipSnapshot.create"), "no ownership given, no snapshot");
});

test("investments: Correct rejects a bad amount without changing anything", async () => {
  setCurrentUser(REAL_USER);
  const admin = recordingDb(ADMIN);
  setDbStub(admin.db);
  const result = await actions.correctInvestmentAction(
    { error: null },
    form({ agreementId: "agr_old", investedAmount: "abc", currency: "USD", signedDate: "2024-01-01" })
  );
  assert.ok(result.fieldErrors?.investedAmount);
  assert.ok(!admin.calls.some((c) => c.startsWith("investmentAgreement.")), "nothing touched");
});

function answeredMetricsStub(updates: { where: { id: string }; data: Record<string, unknown> }[], templateUpdates: Record<string, unknown>[] = []) {
  return makeAdminActionDbStub({
    falakRoles: OPS,
    models: {
      metricDefinition: {
        findMany: async (args?: { where?: { deletedAt?: unknown } }) => args?.where?.deletedAt ? [] : [
          { id: "m1", key: "revenue_b2b", dataType: "Currency", sortOrder: 1, labelEn: "Revenue", _count: { currentValues: 3, snapshotValues: 0 } },
          { id: "m2", key: "total_revenue", dataType: "Number", sortOrder: 2, labelEn: "Total", _count: { currentValues: 2, snapshotValues: 1 } },
        ],
        update: async (args: { where: { id: string }; data: Record<string, unknown> }) => {
          updates.push(args);
          return {};
        },
        createMany: async ({ data }: { data: unknown[] }) => ({ count: data.length }),
      },
      reportingTemplate: {
        update: async (args: { data: Record<string, unknown> }) => {
          templateUpdates.push(args.data);
          return {};
        },
      },
    },
  });
}

const ANSWERED_BASE = {
  templateId: "t1",
  nameEn: "Quarterly",
  nameAr: "ربع سنوي",
  labelEn_m1: "Revenue",
  labelAr_m1: "الإيرادات",
  sortOrder_m1: "1",
  labelEn_m2: "Total revenue",
  labelAr_m2: "إجمالي الإيرادات",
  sortOrder_m2: "2",
};

test("templates: Edit on an answered metric changes its key and switches it to another number type", async () => {
  setCurrentUser(REAL_USER);
  const updates: { where: { id: string }; data: Record<string, unknown> }[] = [];
  const templateUpdates: Record<string, unknown>[] = [];
  setDbStub(answeredMetricsStub(updates, templateUpdates));
  const result = await actions.updateReportingTemplateAction(
    { error: null },
    form({ ...ANSWERED_BASE, unlock_m2: "on", key_m2: "Revenue Total", dataType_m2: "Currency", collectFinancialStatements: "on" })
  );
  assert.equal(result.error, null);
  const m2 = updates.filter((u) => u.where.id === "m2").at(-1)!.data;
  assert.equal(m2.key, "revenue_total");
  assert.equal(m2.dataType, "Currency");
  const m1 = updates.filter((u) => u.where.id === "m1").at(-1)!.data;
  assert.equal("key" in m1, false, "not opened with Edit: stays locked");
  assert.equal(templateUpdates[0].collectFinancialStatements, true);
});

test("templates: Edit can't rename a key the charts read, or turn answered numbers into text", async () => {
  setCurrentUser(REAL_USER);
  setDbStub(answeredMetricsStub([]));
  const result = await actions.updateReportingTemplateAction(
    { error: null },
    form({ ...ANSWERED_BASE, unlock_m1: "on", key_m1: "sales", dataType_m1: "Currency", unlock_m2: "on", key_m2: "total_revenue", dataType_m2: "Text" })
  );
  assert.match(result.fieldErrors?.key_m1 ?? "", /feeds the charts/);
  assert.match(result.fieldErrors?.dataType_m2 ?? "", /Currency, Percent and Number/);
});
