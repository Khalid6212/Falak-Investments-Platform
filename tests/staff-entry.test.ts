import { test } from "node:test";
import assert from "node:assert/strict";
import { setCurrentUser, setDbStub, makeAdminActionDbStub, REAL_USER } from "./support/stubs.ts";

// Imports the REAL production module via tests/support/mock-loader.mjs.
const { staffSaveCycleValues } = await import("../src/lib/reporting/staff-entry.ts");
const { ForbiddenError } = await import("../src/lib/auth/authorization-errors.ts");

const ADMIN_ROLE = [{ role: "FALAK_ADMIN" }];
const DEFINITIONS = [
  { id: "m_revenue", dataType: "Currency", required: true },
  { id: "m_notes", dataType: "Text", required: false },
];

function makeStub(options: { falakRoles?: typeof ADMIN_ROLE; status?: string; answered?: { metricDefinitionId: string; isNa: boolean; numericValue: string | null; textValue: string | null }[] }) {
  const upserts: Record<string, unknown>[] = [];
  const statusUpdates: Record<string, unknown>[] = [];
  const workflowEvents: Record<string, unknown>[] = [];
  const stub = makeAdminActionDbStub({
    falakRoles: options.falakRoles ?? ADMIN_ROLE,
    models: {
      reportingCycle: {
        findFirst: async () => ({
          id: "cy_1",
          templateId: "tpl_1",
          periodLabel: "Q3 2026",
          periodStart: new Date("2026-07-01"),
          periodEnd: new Date("2026-09-30"),
          currentDeadline: new Date("2026-10-15"),
          template: { nameEn: "Quarterly", nameAr: "ربعي" },
          company: { id: "co_1", slug: "test", nameEn: "TEST", nameAr: "تست", currency: "SAR", department: "InvestmentDepartment" },
          submission: { id: "sub_1", status: options.status ?? "draft" },
        }),
      },
      metricDefinition: { findMany: async () => DEFINITIONS },
      submissionMetricValue: {
        upsert: async ({ create }: { create: Record<string, unknown> }) => {
          upserts.push(create);
          return create;
        },
        findMany: async () => options.answered ?? [],
      },
      companySubmission: {
        updateMany: async (args: Record<string, unknown>) => {
          statusUpdates.push(args);
          return { count: 1 };
        },
      },
      submissionWorkflowEvent: {
        count: async () => 0,
        create: async ({ data }: { data: Record<string, unknown> }) => {
          workflowEvents.push(data);
          return data;
        },
      },
    },
  });
  return { stub, upserts, statusUpdates, workflowEvents };
}

const REVENUE = { metricDefinitionId: "m_revenue", rawValue: "250,000", isNa: false };

test("staff entry: a caller with no Falak role is denied", async () => {
  setCurrentUser(REAL_USER);
  const { stub } = makeStub({ falakRoles: [] });
  setDbStub(stub);
  await assert.rejects(() => staffSaveCycleValues("cy_1", [REVENUE], false), ForbiddenError);
});

test("staff entry: saves a draft's figures and audits it, without submitting", async () => {
  setCurrentUser(REAL_USER);
  const { stub, upserts, statusUpdates } = makeStub({ status: "draft" });
  setDbStub(stub);
  const result = await staffSaveCycleValues("cy_1", [REVENUE], false);
  assert.deepEqual(result, { error: null, success: true, submitted: false });
  assert.equal(upserts.length, 1);
  assert.equal(upserts[0].numericValue, "250000");
  assert.equal(statusUpdates.length, 0);
  assert.ok(stub.getAuditEvents().some((e) => e.action === "submission.values_entered_by_staff"));
});

test("staff entry: save and submit moves a complete draft to submitted, with a workflow event", async () => {
  setCurrentUser(REAL_USER);
  const { stub, statusUpdates, workflowEvents } = makeStub({
    status: "draft",
    answered: [{ metricDefinitionId: "m_revenue", isNa: false, numericValue: "250000", textValue: null }],
  });
  setDbStub(stub);
  const result = await staffSaveCycleValues("cy_1", [REVENUE], true);
  assert.equal(result.submitted, true);
  assert.equal((statusUpdates[0].data as Record<string, unknown>).status, "submitted");
  assert.equal(workflowEvents[0].toStatus, "submitted");
  assert.ok(stub.getAuditEvents().some((e) => e.action === "submission.submitted_by_staff"));
});

test("staff entry: submitting with a required field empty names it and saves nothing", async () => {
  setCurrentUser(REAL_USER);
  const { stub, statusUpdates } = makeStub({ status: "draft", answered: [] });
  setDbStub(stub);
  const result = await staffSaveCycleValues("cy_1", [{ metricDefinitionId: "m_notes", rawValue: "hi", isNa: false }], true);
  assert.equal(result.success, false);
  assert.deepEqual(Object.keys(result.fieldErrors ?? {}), ["value_m_revenue"]);
  assert.equal(statusUpdates.length, 0);
});

test("staff entry: an invalid number is highlighted and nothing is written", async () => {
  setCurrentUser(REAL_USER);
  const { stub, upserts } = makeStub({ status: "draft" });
  setDbStub(stub);
  const result = await staffSaveCycleValues("cy_1", [{ metricDefinitionId: "m_revenue", rawValue: "abc", isNa: false }], false);
  assert.equal(result.success, false);
  assert.ok(result.fieldErrors?.value_m_revenue);
  assert.equal(upserts.length, 0);
});

test("staff entry: an investment professional can edit a changes-requested report and send it back to review", async () => {
  setCurrentUser(REAL_USER);
  const { stub, upserts, statusUpdates, workflowEvents } = makeStub({
    falakRoles: [{ role: "FALAK_OPERATIONS" }],
    status: "changes_requested",
    answered: [{ metricDefinitionId: "m_revenue", isNa: false, numericValue: "250000", textValue: null }],
  });
  setDbStub(stub);

  const saved = await staffSaveCycleValues("cy_1", [REVENUE], false);
  assert.deepEqual(saved, { error: null, success: true, submitted: false });
  assert.equal(upserts.length, 1);
  assert.equal(statusUpdates.length, 0);

  const submitted = await staffSaveCycleValues("cy_1", [REVENUE], true);
  assert.deepEqual(submitted, { error: null, success: true, submitted: true });
  assert.equal(statusUpdates.length, 1);
  assert.equal(workflowEvents[0].fromStatus, "changes_requested");
  assert.equal(workflowEvents[0].toStatus, "submitted");
});

test("staff entry: a field saved as N/A can be given a real value, and a value can become N/A", async () => {
  setCurrentUser(REAL_USER);
  const { stub, upserts } = makeStub({ status: "changes_requested" });
  setDbStub(stub);
  const result = await staffSaveCycleValues(
    "cy_1",
    [
      { metricDefinitionId: "m_revenue", rawValue: "250,000", isNa: false },
      { metricDefinitionId: "m_notes", rawValue: "", isNa: true },
    ],
    false
  );
  assert.equal(result.success, true);
  assert.equal(upserts[0].isNa, false);
  assert.equal(String(upserts[0].numericValue), "250000");
  assert.equal(upserts[1].isNa, true);
  assert.equal(upserts[1].textValue, null);
});

test("staff entry: a submitted report can be corrected but is not re-submitted", async () => {
  setCurrentUser(REAL_USER);
  const { stub, upserts, statusUpdates } = makeStub({ status: "submitted" });
  setDbStub(stub);
  const result = await staffSaveCycleValues("cy_1", [REVENUE], true);
  assert.deepEqual(result, { error: null, success: true, submitted: false });
  assert.equal(upserts.length, 1);
  assert.equal(statusUpdates.length, 0);
});

test("staff entry: approved and published reports are locked", async () => {
  setCurrentUser(REAL_USER);
  for (const status of ["approved", "published"]) {
    const { stub, upserts } = makeStub({ status });
    setDbStub(stub);
    const result = await staffSaveCycleValues("cy_1", [REVENUE], false);
    assert.equal(result.success, false, status);
    assert.equal(upserts.length, 0, status);
  }
});
