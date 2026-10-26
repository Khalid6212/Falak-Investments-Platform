import { test } from "node:test";
import assert from "node:assert/strict";
import {
  setCurrentUser,
  setDbStub,
  makeReportingDbStub,
  makeReviewWorkflowDbStub,
  makePublishWorkflowDbStub,
  makeAdminActionDbStub,
  REAL_USER,
} from "./support/stubs.ts";

// Real-module tests (via tests/support/mock-loader.mjs) asserting that
// every mutation in the action -> event table from the Step 12 plan writes
// exactly one AuditEvent row, with the right action/targetType/targetId/
// actorId, atomically alongside its own mutation. Doesn't re-cover
// transition/validation logic already exercised by reporting.test.ts,
// review-workflow.test.ts, publish-workflow.test.ts, and
// admin-actions.test.ts -- only the audit trail each success path leaves.

const OPERATIONS_ROLE = [{ role: "FALAK_OPERATIONS" }];
const ADMIN_ROLE = [{ role: "FALAK_ADMIN" }];

// ============================================================
// submissions.ts / review-workflow.ts / publish-workflow.ts
// ============================================================

test("submitCompanySubmission writes a submission.submitted audit event", async () => {
  const { submitCompanySubmission } = await import("../src/lib/reporting/submissions.ts");
  setCurrentUser(REAL_USER);
  const db = makeReportingDbStub({
    membership: { userId: "user_1", companyId: "co_1", role: "MEMBER" },
    submission: {
      id: "sub_1",
      cycleCompanyId: "co_1",
      templateId: "tmpl_1",
      status: "draft",
      periodLabel: "Q1 2026",
      periodStart: new Date("2026-01-01"),
      periodEnd: new Date("2026-03-31"),
      currentDeadline: new Date("2026-04-15"),
    },
    metricDefinitions: [{ id: "metric_1", templateId: "tmpl_1", isActive: true, required: true }],
    submissionMetricValues: [
      { submissionId: "sub_1", metricDefinitionId: "metric_1", isNa: false, numericValue: 100, textValue: null },
    ],
  });
  setDbStub(db);
  await submitCompanySubmission("co_1", "sub_1");

  const events = db.getAuditEvents();
  assert.equal(events.length, 1);
  assert.equal(events[0].actorId, "user_1");
  assert.equal(events[0].action, "submission.submitted");
  assert.equal(events[0].targetType, "CompanySubmission");
  assert.equal(events[0].targetId, "sub_1");
});

test("startReview writes a submission.review_started audit event", async () => {
  const { startReview } = await import("../src/lib/reporting/review-workflow.ts");
  setCurrentUser(REAL_USER);
  const db = makeReviewWorkflowDbStub({ falakRoles: OPERATIONS_ROLE, submission: { id: "sub_1", status: "submitted" } });
  setDbStub(db);
  await startReview("sub_1");

  const events = db.getAuditEvents();
  assert.equal(events.length, 1);
  assert.equal(events[0].actorId, "user_1");
  assert.equal(events[0].action, "submission.review_started");
  assert.equal(events[0].targetType, "CompanySubmission");
  assert.equal(events[0].targetId, "sub_1");
});

test("requestChanges writes a submission.changes_requested audit event", async () => {
  const { requestChanges } = await import("../src/lib/reporting/review-workflow.ts");
  setCurrentUser(REAL_USER);
  const db = makeReviewWorkflowDbStub({ falakRoles: OPERATIONS_ROLE, submission: { id: "sub_1", status: "under_review" } });
  setDbStub(db);
  await requestChanges("sub_1", "please fix the numbers");

  const events = db.getAuditEvents();
  assert.equal(events.length, 1);
  assert.equal(events[0].actorId, "user_1");
  assert.equal(events[0].action, "submission.changes_requested");
  assert.equal(events[0].targetType, "CompanySubmission");
  assert.equal(events[0].targetId, "sub_1");
});

test("approveSubmission writes a submission.approved audit event", async () => {
  const { approveSubmission } = await import("../src/lib/reporting/review-workflow.ts");
  setCurrentUser(REAL_USER);
  const db = makeReviewWorkflowDbStub({ falakRoles: OPERATIONS_ROLE, submission: { id: "sub_1", status: "under_review" } });
  setDbStub(db);
  await approveSubmission("sub_1");

  const events = db.getAuditEvents();
  assert.equal(events.length, 1);
  assert.equal(events[0].actorId, "user_1");
  assert.equal(events[0].action, "submission.approved");
  assert.equal(events[0].targetType, "CompanySubmission");
  assert.equal(events[0].targetId, "sub_1");
});

test("publishSubmission writes a report.published audit event targeting the new ReportVersion", async () => {
  const { publishSubmission } = await import("../src/lib/reporting/publish-workflow.ts");
  setCurrentUser(REAL_USER);
  const db = makePublishWorkflowDbStub({
    falakRoles: ADMIN_ROLE,
    submission: {
      id: "sub_1",
      status: "approved",
      companyId: "co_1",
      periodLabel: "Q2 2026",
      periodStart: new Date("2026-04-01"),
      periodEnd: new Date("2026-06-30"),
    },
  });
  setDbStub(db);
  const { versionNo } = await publishSubmission("sub_1", {});

  const events = db.getAuditEvents();
  assert.equal(events.length, 1);
  assert.equal(events[0].actorId, "user_1");
  assert.equal(events[0].action, "report.published");
  assert.equal(events[0].targetType, "ReportVersion");
  const versions = db.getReportVersions();
  const newVersion = versions.find((v) => v.versionNo === versionNo);
  assert.ok(newVersion);
  assert.equal(events[0].targetId, newVersion!.id);
});

// ============================================================
// admin/actions.ts -- the 7 newly-transactional actions
// ============================================================

test("createCompanyAction writes a company.created audit event", async () => {
  const actions = await import("../src/app/admin/actions.ts");
  setCurrentUser(REAL_USER);
  const db = makeAdminActionDbStub({
    falakRoles: ADMIN_ROLE,
    models: {
      company: {
        findUnique: async () => null,
        create: async ({ data }: { data: Record<string, unknown> }) => ({ id: "co_new", ...data }),
      },
    },
  });
  setDbStub(db);

  const formData = new FormData();
  formData.set("slug", "acme");
  formData.set("nameEn", "Acme");
  formData.set("nameAr", "acme-ar");
  formData.set("industry", "Other");
  formData.set("sectorEn", "Retail");
  formData.set("sectorAr", "retail-ar");
  formData.set("customerModel", "B2C");
  formData.set("currency", "SAR");
  formData.set("entryStage", "Seed");
  formData.set("currentStage", "Seed");
  formData.set("department", "InvestmentDepartment");

  const result = await actions.createCompanyAction({ error: null }, formData);
  assert.equal(result.error, null);

  const events = db.getAuditEvents();
  assert.equal(events.length, 1);
  assert.equal(events[0].actorId, "user_1");
  assert.equal(events[0].action, "company.created");
  assert.equal(events[0].targetType, "Company");
  assert.equal(events[0].targetId, "co_new");
});

test("archiveCompanyAction writes a company.archived audit event", async () => {
  const actions = await import("../src/app/admin/actions.ts");
  setCurrentUser(REAL_USER);
  const db = makeAdminActionDbStub({
    falakRoles: ADMIN_ROLE,
    models: {
      company: { update: async ({ where }: { where: { id: string } }) => ({ id: where.id }) },
    },
  });
  setDbStub(db);

  const formData = new FormData();
  formData.set("companyId", "co_1");
  await actions.archiveCompanyAction(formData);

  const events = db.getAuditEvents();
  assert.equal(events.length, 1);
  assert.equal(events[0].actorId, "user_1");
  assert.equal(events[0].action, "company.archived");
  assert.equal(events[0].targetType, "Company");
  assert.equal(events[0].targetId, "co_1");
});

test("createVehicleAction writes a vehicle.created audit event", async () => {
  const actions = await import("../src/app/admin/actions.ts");
  setCurrentUser(REAL_USER);
  const db = makeAdminActionDbStub({
    falakRoles: ADMIN_ROLE,
    models: {
      vehicle: {
        findUnique: async () => null,
        create: async ({ data }: { data: Record<string, unknown> }) => ({ id: "veh_new", ...data }),
      },
    },
  });
  setDbStub(db);

  const formData = new FormData();
  formData.set("slug", "fund-one");
  formData.set("nameEn", "Fund One");
  formData.set("nameAr", "fund-one-ar");
  formData.set("type", "Fund");
  formData.set("currency", "SAR");
  formData.set("department", "InvestmentDepartment");

  const result = await actions.createVehicleAction({ error: null }, formData);
  assert.equal(result.error, null);

  const events = db.getAuditEvents();
  assert.equal(events.length, 1);
  assert.equal(events[0].action, "vehicle.created");
  assert.equal(events[0].targetType, "Vehicle");
  assert.equal(events[0].targetId, "veh_new");
});

test("archiveVehicleAction writes a vehicle.archived audit event", async () => {
  const actions = await import("../src/app/admin/actions.ts");
  setCurrentUser(REAL_USER);
  const db = makeAdminActionDbStub({
    falakRoles: ADMIN_ROLE,
    models: { vehicle: { update: async ({ where }: { where: { id: string } }) => ({ id: where.id }) } },
  });
  setDbStub(db);

  const formData = new FormData();
  formData.set("vehicleId", "veh_1");
  await actions.archiveVehicleAction(formData);

  const events = db.getAuditEvents();
  assert.equal(events.length, 1);
  assert.equal(events[0].action, "vehicle.archived");
  assert.equal(events[0].targetType, "Vehicle");
  assert.equal(events[0].targetId, "veh_1");
});

test("createInvestorAction writes an investor.created audit event", async () => {
  const actions = await import("../src/app/admin/actions.ts");
  setCurrentUser(REAL_USER);
  const db = makeAdminActionDbStub({
    falakRoles: ADMIN_ROLE,
    models: {
      investor: { create: async ({ data }: { data: Record<string, unknown> }) => ({ id: "inv_new", ...data }) },
    },
  });
  setDbStub(db);

  const formData = new FormData();
  formData.set("nameEn", "Investor One");
  formData.set("nameAr", "investor-one-ar");
  formData.set("type", "Individual");
  formData.set("department", "InvestmentDepartment");

  const result = await actions.createInvestorAction({ error: null }, formData);
  assert.equal(result.error, null);

  const events = db.getAuditEvents();
  assert.equal(events.length, 1);
  assert.equal(events[0].action, "investor.created");
  assert.equal(events[0].targetType, "Investor");
  assert.equal(events[0].targetId, "inv_new");
});

test("archiveInvestorAction writes an investor.archived audit event", async () => {
  const actions = await import("../src/app/admin/actions.ts");
  setCurrentUser(REAL_USER);
  const db = makeAdminActionDbStub({
    falakRoles: ADMIN_ROLE,
    models: { investor: { update: async ({ where }: { where: { id: string } }) => ({ id: where.id }) } },
  });
  setDbStub(db);

  const formData = new FormData();
  formData.set("investorId", "inv_1");
  await actions.archiveInvestorAction(formData);

  const events = db.getAuditEvents();
  assert.equal(events.length, 1);
  assert.equal(events[0].action, "investor.archived");
  assert.equal(events[0].targetType, "Investor");
  assert.equal(events[0].targetId, "inv_1");
});

test("linkVehicleToCompanyAction writes an ownership_position.linked audit event", async () => {
  const actions = await import("../src/app/admin/actions.ts");
  setCurrentUser(REAL_USER);
  const db = makeAdminActionDbStub({
    falakRoles: ADMIN_ROLE,
    models: {
      company: { findUnique: async () => ({ id: "co_1", slug: "acme" }) },
      vehicle: { findUnique: async () => ({ id: "veh_1", slug: "fund-one" }) },
      ownershipPosition: {
        findFirst: async () => null,
        create: async ({ data }: { data: Record<string, unknown> }) => ({ id: "pos_new", ...data }),
      },
      investmentAgreement: { create: async ({ data }: { data: Record<string, unknown> }) => ({ id: "agr_new", ...data }) },
      ownershipSnapshot: { create: async ({ data }: { data: Record<string, unknown> }) => ({ id: "snap_new", ...data }) },
    },
  });
  setDbStub(db);

  const formData = new FormData();
  formData.set("companyId", "co_1");
  formData.set("vehicleId", "veh_1");
  formData.set("investedAmount", "1000000");
  formData.set("currency", "SAR");
  formData.set("ownershipPct", "10");
  formData.set("signedDate", "2026-01-01");

  const result = await actions.linkVehicleToCompanyAction({ error: null }, formData);
  assert.equal(result.error, null);

  const events = db.getAuditEvents();
  assert.equal(events.length, 1);
  assert.equal(events[0].action, "ownership_position.linked");
  assert.equal(events[0].targetType, "OwnershipPosition");
  assert.equal(events[0].targetId, "pos_new");
});

test("linkVehicleToCompanyAction accepts a thousands-separator-formatted investedAmount (e.g. 1,000,000)", async () => {
  const actions = await import("../src/app/admin/actions.ts");
  setCurrentUser(REAL_USER);
  let storedAgreement: Record<string, unknown> | undefined;
  const db = makeAdminActionDbStub({
    falakRoles: ADMIN_ROLE,
    models: {
      company: { findUnique: async () => ({ id: "co_1", slug: "acme" }) },
      vehicle: { findUnique: async () => ({ id: "veh_1", slug: "fund-one" }) },
      ownershipPosition: {
        findFirst: async () => null,
        create: async ({ data }: { data: Record<string, unknown> }) => ({ id: "pos_new", ...data }),
      },
      investmentAgreement: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          storedAgreement = data;
          return { id: "agr_new", ...data };
        },
      },
      ownershipSnapshot: { create: async ({ data }: { data: Record<string, unknown> }) => ({ id: "snap_new", ...data }) },
    },
  });
  setDbStub(db);

  const formData = new FormData();
  formData.set("companyId", "co_1");
  formData.set("vehicleId", "veh_1");
  formData.set("investedAmount", "1,000,000");
  formData.set("currency", "SAR");
  formData.set("ownershipPct", "10");
  formData.set("signedDate", "2026-01-01");

  const result = await actions.linkVehicleToCompanyAction({ error: null }, formData);
  assert.equal(result.error, null);
  assert.equal(storedAgreement?.investedAmount, "1000000");
});

function makeInvestorVehicleLinkDbStub(options: {
  existingPosition?: { id: string } | null;
  vehicleAgreements?: { investedAmount: { toNumber: () => number } | null; currency: string | null }[];
  vehicleCompanyIds?: string[];
  publishedVersionIds?: string[];
}) {
  const grantUpserts: Record<string, unknown>[] = [];
  const createCalls: Record<string, unknown>[] = [];
  const db = makeAdminActionDbStub({
    falakRoles: ADMIN_ROLE,
    models: {
      investor: { findUnique: async () => ({ id: "inv_1", nameEn: "Acme Capital" }) },
      vehicle: { findUnique: async () => ({ id: "veh_1", slug: "fund-one" }) },
      investorVehiclePosition: {
        findUnique: async () => options.existingPosition ?? null,
        create: async ({ data }: { data: Record<string, unknown> }) => {
          createCalls.push(data);
          return { id: "pos_new", ...data };
        },
      },
      investmentAgreement: { findMany: async () => options.vehicleAgreements ?? [] },
      ownershipPosition: {
        findMany: async () => (options.vehicleCompanyIds ?? []).map((companyId) => ({ companyId })),
      },
      reportVersion: {
        findMany: async () => (options.publishedVersionIds ?? []).map((id) => ({ id })),
      },
      reportAccessGrant: {
        upsert: async ({ create }: { create: Record<string, unknown> }) => {
          grantUpserts.push(create);
          return create;
        },
      },
    },
  });
  return { db, getGrantUpserts: () => grantUpserts, getCreateCalls: () => createCalls };
}

test("linkInvestorToVehicleAction writes an investor_vehicle_position.linked audit event", async () => {
  const actions = await import("../src/app/admin/actions.ts");
  setCurrentUser(REAL_USER);
  const { db } = makeInvestorVehicleLinkDbStub({});
  setDbStub(db);

  const formData = new FormData();
  formData.set("investorId", "inv_1");
  formData.set("vehicleId", "veh_1");
  formData.set("currency", "SAR");
  formData.set("effectiveFrom", "2026-01-01");
  formData.set("commitmentAmount", "5000000");

  const result = await actions.linkInvestorToVehicleAction({ error: null }, formData);
  assert.equal(result.error, null);
  assert.equal(result.success, true);

  const events = db.getAuditEvents();
  assert.equal(events.length, 1);
  assert.equal(events[0].action, "investor_vehicle_position.linked");
  assert.equal(events[0].targetType, "InvestorVehiclePosition");
  assert.equal(events[0].targetId, "pos_new");
});

test("linkInvestorToVehicleAction rejects a duplicate assignment for the same effective date", async () => {
  const actions = await import("../src/app/admin/actions.ts");
  setCurrentUser(REAL_USER);
  const { db } = makeInvestorVehicleLinkDbStub({ existingPosition: { id: "existing_pos" } });
  setDbStub(db);

  const formData = new FormData();
  formData.set("investorId", "inv_1");
  formData.set("vehicleId", "veh_1");
  formData.set("currency", "SAR");
  formData.set("effectiveFrom", "2026-01-01");

  const result = await actions.linkInvestorToVehicleAction({ error: null }, formData);
  assert.ok(result.error);
  assert.equal(result.success, undefined);
});

test("linkInvestorToVehicleAction computes ownershipPct as contribution / vehicle invested capital, never from manual input", async () => {
  const actions = await import("../src/app/admin/actions.ts");
  setCurrentUser(REAL_USER);
  const { db, getCreateCalls } = makeInvestorVehicleLinkDbStub({
    vehicleAgreements: [{ investedAmount: { toNumber: () => 2000000 }, currency: "SAR" }],
  });
  setDbStub(db);

  const formData = new FormData();
  formData.set("investorId", "inv_1");
  formData.set("vehicleId", "veh_1");
  formData.set("currency", "SAR");
  formData.set("effectiveFrom", "2026-01-01");
  formData.set("commitmentAmount", "500000");
  // Even if a client somehow still sent one, it must be ignored.
  formData.set("ownershipPct", "0.99");

  const result = await actions.linkInvestorToVehicleAction({ error: null }, formData);
  assert.equal(result.error, null);
  assert.equal(getCreateCalls()[0].ownershipPct, 0.25, "500,000 / 2,000,000, never the submitted 0.99");
});

test("linkInvestorToVehicleAction converts the vehicle's invested capital to the position's own currency before dividing", async () => {
  const actions = await import("../src/app/admin/actions.ts");
  setCurrentUser(REAL_USER);
  const { db, getCreateCalls } = makeInvestorVehicleLinkDbStub({
    // 2,000,000 USD vehicle agreement, position recorded in SAR (x3.75).
    vehicleAgreements: [{ investedAmount: { toNumber: () => 2000000 }, currency: "USD" }],
  });
  setDbStub(db);

  const formData = new FormData();
  formData.set("investorId", "inv_1");
  formData.set("vehicleId", "veh_1");
  formData.set("currency", "SAR");
  formData.set("effectiveFrom", "2026-01-01");
  formData.set("commitmentAmount", "1875000"); // = 500,000 USD equivalent

  const result = await actions.linkInvestorToVehicleAction({ error: null }, formData);
  assert.equal(result.error, null);
  assert.equal(getCreateCalls()[0].ownershipPct, 0.25);
});

test("linkInvestorToVehicleAction leaves ownershipPct null when the vehicle has no recorded invested capital yet", async () => {
  const actions = await import("../src/app/admin/actions.ts");
  setCurrentUser(REAL_USER);
  const { db, getCreateCalls } = makeInvestorVehicleLinkDbStub({ vehicleAgreements: [] });
  setDbStub(db);

  const formData = new FormData();
  formData.set("investorId", "inv_1");
  formData.set("vehicleId", "veh_1");
  formData.set("currency", "SAR");
  formData.set("effectiveFrom", "2026-01-01");
  formData.set("commitmentAmount", "500000");

  const result = await actions.linkInvestorToVehicleAction({ error: null }, formData);
  assert.equal(result.error, null);
  assert.equal(getCreateCalls()[0].ownershipPct, null);
});

test("linkInvestorToVehicleAction backfills ReportAccessGrant for every already-published report of the vehicle's companies", async () => {
  const actions = await import("../src/app/admin/actions.ts");
  setCurrentUser(REAL_USER);
  const { db, getGrantUpserts } = makeInvestorVehicleLinkDbStub({
    vehicleCompanyIds: ["co_1", "co_2"],
    publishedVersionIds: ["version_1", "version_2"],
  });
  setDbStub(db);

  const formData = new FormData();
  formData.set("investorId", "inv_1");
  formData.set("vehicleId", "veh_1");
  formData.set("currency", "SAR");
  formData.set("effectiveFrom", "2026-01-01");

  const result = await actions.linkInvestorToVehicleAction({ error: null }, formData);
  assert.equal(result.error, null);

  const upserts = getGrantUpserts();
  assert.equal(upserts.length, 2);
  assert.deepEqual(upserts.map((u) => u.reportVersionId).sort(), ["version_1", "version_2"]);
  assert.ok(upserts.every((u) => u.investorId === "inv_1"));
});

test("unassignInvestorFromVehicleAction writes an investor_vehicle_position.unassigned audit event", async () => {
  const actions = await import("../src/app/admin/actions.ts");
  setCurrentUser(REAL_USER);
  const db = makeAdminActionDbStub({
    falakRoles: ADMIN_ROLE,
    models: {
      investorVehiclePosition: { update: async ({ data }: { data: Record<string, unknown> }) => ({ id: "pos_1", ...data }) },
    },
  });
  setDbStub(db);

  const formData = new FormData();
  formData.set("positionId", "pos_1");
  await actions.unassignInvestorFromVehicleAction(formData);

  const events = db.getAuditEvents();
  assert.equal(events.length, 1);
  assert.equal(events[0].action, "investor_vehicle_position.unassigned");
  assert.equal(events[0].targetId, "pos_1");
});

test("createReportingTemplateAction writes a reporting_template.created audit event", async () => {
  const actions = await import("../src/app/admin/actions.ts");
  setCurrentUser(REAL_USER);
  const db = makeAdminActionDbStub({
    falakRoles: ADMIN_ROLE,
    models: {
      reportingTemplate: { create: async ({ data }: { data: Record<string, unknown> }) => ({ id: "tmpl_new", ...data }) },
      metricDefinition: { createMany: async () => ({ count: 1 }) },
    },
  });
  setDbStub(db);

  const formData = new FormData();
  formData.set("nameEn", "Quarterly");
  formData.set("nameAr", "quarterly-ar");
  formData.set("metricKey_0", "revenue");
  formData.set("metricLabelEn_0", "Revenue");
  formData.set("metricLabelAr_0", "revenue-ar");
  formData.set("metricDataType_0", "Currency");

  const result = await actions.createReportingTemplateAction({ error: null }, formData);
  assert.equal(result.error, null);

  const events = db.getAuditEvents();
  assert.equal(events.length, 1);
  assert.equal(events[0].action, "reporting_template.created");
  assert.equal(events[0].targetType, "ReportingTemplate");
  assert.equal(events[0].targetId, "tmpl_new");
});

test("createReportingCycleAction writes a reporting_cycle.created audit event", async () => {
  const actions = await import("../src/app/admin/actions.ts");
  setCurrentUser(REAL_USER);
  const db = makeAdminActionDbStub({
    falakRoles: ADMIN_ROLE,
    models: {
      reportingCycle: {
        findUnique: async () => null,
        create: async ({ data }: { data: Record<string, unknown> }) => ({ id: "cycle_new", ...data }),
      },
      companySubmission: { create: async ({ data }: { data: Record<string, unknown> }) => ({ id: "sub_new", ...data }) },
    },
  });
  setDbStub(db);

  const formData = new FormData();
  formData.append("companyIds", "co_1");
  formData.set("templateId", "tmpl_1");
  formData.set("periodLabel", "Q1 2026");
  formData.set("periodStart", "2026-01-01");
  formData.set("periodEnd", "2026-03-31");
  formData.set("deadline", "2026-04-15");

  const result = await actions.createReportingCycleAction({ error: null }, formData);
  assert.equal(result.error, null);

  const events = db.getAuditEvents();
  assert.equal(events.length, 1);
  assert.equal(events[0].action, "reporting_cycle.created");
  assert.equal(events[0].targetType, "ReportingCycle");
  assert.equal(events[0].targetId, "cycle_new");
});

test("createReportingCycleAction creates one cycle per selected company, skipping any that already has one", async () => {
  const actions = await import("../src/app/admin/actions.ts");
  setCurrentUser(REAL_USER);
  let createCalls = 0;
  const db = makeAdminActionDbStub({
    falakRoles: ADMIN_ROLE,
    models: {
      reportingCycle: {
        findUnique: async ({ where }: { where: { companyId_templateId_periodStart_periodEnd: { companyId: string } } }) =>
          where.companyId_templateId_periodStart_periodEnd.companyId === "co_2" ? { id: "existing_cycle" } : null,
        create: async ({ data }: { data: Record<string, unknown> }) => {
          createCalls += 1;
          return { id: `cycle_${createCalls}`, ...data };
        },
      },
      companySubmission: { create: async ({ data }: { data: Record<string, unknown> }) => ({ id: "sub_new", ...data }) },
    },
  });
  setDbStub(db);

  const formData = new FormData();
  formData.append("companyIds", "co_1");
  formData.append("companyIds", "co_2");
  formData.append("companyIds", "co_3");
  formData.set("templateId", "tmpl_1");
  formData.set("periodLabel", "Q1 2026");
  formData.set("periodStart", "2026-01-01");
  formData.set("periodEnd", "2026-03-31");
  formData.set("deadline", "2026-04-15");

  const result = await actions.createReportingCycleAction({ error: null }, formData);
  assert.equal(result.error, null);
  assert.equal(result.success, true);
  assert.equal(createCalls, 2, "co_2 already has a cycle and must be skipped");

  const events = db.getAuditEvents();
  assert.equal(events.length, 2, "one audit event per newly created cycle, not per selected company");
});

test("createReportingCycleAction fails when every selected company already has this exact cycle", async () => {
  const actions = await import("../src/app/admin/actions.ts");
  setCurrentUser(REAL_USER);
  const db = makeAdminActionDbStub({
    falakRoles: ADMIN_ROLE,
    models: {
      reportingCycle: { findUnique: async () => ({ id: "existing_cycle" }) },
    },
  });
  setDbStub(db);

  const formData = new FormData();
  formData.append("companyIds", "co_1");
  formData.set("templateId", "tmpl_1");
  formData.set("periodLabel", "Q1 2026");
  formData.set("periodStart", "2026-01-01");
  formData.set("periodEnd", "2026-03-31");
  formData.set("deadline", "2026-04-15");

  const result = await actions.createReportingCycleAction({ error: null }, formData);
  assert.ok(result.error);
  assert.equal(result.success, undefined);
});

test("createCompanyInviteAction writes an invite.created audit event", async () => {
  const actions = await import("../src/app/admin/actions.ts");
  setCurrentUser(REAL_USER);
  const db = makeAdminActionDbStub({
    falakRoles: ADMIN_ROLE,
    models: {
      company: { findUnique: async () => ({ id: "co_1", slug: "acme" }) },
      companyInvite: { create: async ({ data }: { data: Record<string, unknown> }) => ({ id: "invite_new", ...data }) },
    },
  });
  setDbStub(db);

  const formData = new FormData();
  formData.set("companyId", "co_1");
  formData.set("email", "founder@example.com");

  const result = await actions.createCompanyInviteAction({ error: null }, formData);
  assert.equal(result.error, null);
  assert.ok(result.inviteUrl);

  const events = db.getAuditEvents();
  assert.equal(events.length, 1);
  assert.equal(events[0].action, "invite.created");
  assert.equal(events[0].targetType, "CompanyInvite");
  assert.equal(events[0].targetId, "invite_new");
});

// ============================================================
// accept-invite/actions.ts
// ============================================================

test("acceptInviteAction (new-user path) writes an invite.accepted audit event attributed to the newly-created user", async () => {
  const { acceptInviteAction } = await import("../src/app/accept-invite/actions.ts");
  const { MockRedirectError } = (await import("next/navigation")) as unknown as {
    MockRedirectError: new (url: string) => Error & { url: string };
  };

  const db = makeAdminActionDbStub({
    models: {
      companyInvite: {
        findUnique: async () => ({
          id: "invite_1",
          email: "newperson@example.com",
          tokenHash: "irrelevant",
          revokedAt: null,
          acceptedAt: null,
          expiresAt: new Date(Date.now() + 1000 * 60 * 60),
          company: { id: "co_1", nameEn: "Acme", archivedAt: null },
        }),
        updateMany: async () => ({ count: 1 }),
      },
      user: {
        findUnique: async () => null,
        create: async ({ data }: { data: Record<string, unknown> }) => ({ id: "user_new", ...data }),
      },
      companyMembership: { create: async ({ data }: { data: Record<string, unknown> }) => ({ id: "mem_new", ...data }) },
    },
  });
  setDbStub(db);

  await assert.rejects(
    () => acceptInviteAction("raw_token_value", { error: null }, new FormData()),
    (err: unknown) => {
      assert.ok(err instanceof MockRedirectError);
      assert.equal((err as InstanceType<typeof MockRedirectError>).url, "/sign-in?accepted=1");
      return true;
    }
  );

  const events = db.getAuditEvents();
  assert.equal(events.length, 1);
  assert.equal(events[0].actorId, "user_new");
  assert.equal(events[0].action, "invite.accepted");
  assert.equal(events[0].targetType, "CompanyInvite");
  assert.equal(events[0].targetId, "invite_1");
});

test("completeExistingMemberAction writes an invite.accepted audit event attributed to the existing user", async () => {
  const { completeExistingMemberAction } = await import("../src/app/accept-invite/actions.ts");
  const existingUser = { id: "user_existing", email: "member@example.com" };
  setCurrentUser(existingUser);

  const db = makeAdminActionDbStub({
    models: {
      companyInvite: {
        findUnique: async () => ({
          id: "invite_2",
          email: "member@example.com",
          tokenHash: "irrelevant",
          revokedAt: null,
          acceptedAt: null,
          expiresAt: new Date(Date.now() + 1000 * 60 * 60),
          company: { id: "co_1", nameEn: "Acme", archivedAt: null },
        }),
        updateMany: async () => ({ count: 1 }),
      },
      user: { findUnique: async () => existingUser },
      companyMembership: { upsert: async ({ create }: { create: Record<string, unknown> }) => ({ id: "mem_2", ...create }) },
    },
  });
  setDbStub(db);

  const { MockRedirectError } = (await import("next/navigation")) as unknown as {
    MockRedirectError: new (url: string) => Error & { url: string };
  };

  await assert.rejects(
    () => completeExistingMemberAction("raw_token_value"),
    (err: unknown) => {
      assert.ok(err instanceof MockRedirectError);
      assert.equal((err as InstanceType<typeof MockRedirectError>).url, "/account");
      return true;
    }
  );

  const events = db.getAuditEvents();
  assert.equal(events.length, 1);
  assert.equal(events[0].actorId, "user_existing");
  assert.equal(events[0].action, "invite.accepted");
  assert.equal(events[0].targetType, "CompanyInvite");
  assert.equal(events[0].targetId, "invite_2");
});

test("completeExistingMemberAction reactivates a previously revoked company membership (same rule as investor invites)", async () => {
  const { completeExistingMemberAction } = await import("../src/app/accept-invite/actions.ts");
  const existingUser = { id: "user_existing", email: "member@example.com" };
  setCurrentUser(existingUser);

  let upsertArgs: { where: unknown; update: unknown; create: unknown } | undefined;
  setDbStub(
    makeAdminActionDbStub({
      models: {
        companyInvite: {
          findUnique: async () => ({
            id: "invite_3",
            email: "member@example.com",
            tokenHash: "irrelevant",
            revokedAt: null,
            acceptedAt: null,
            expiresAt: new Date(Date.now() + 1000 * 60 * 60),
            company: { id: "co_1", nameEn: "Acme", archivedAt: null },
          }),
          updateMany: async () => ({ count: 1 }),
        },
        user: { findUnique: async () => existingUser },
        companyMembership: {
          upsert: async (args: { where: unknown; update: unknown; create: unknown }) => {
            upsertArgs = args;
            return {};
          },
        },
      },
    })
  );

  await assert.rejects(() => completeExistingMemberAction("raw_token_value"));

  assert.deepEqual(upsertArgs!.where, { userId_companyId: { userId: "user_existing", companyId: "co_1" } });
  // Clears revokedAt only -- an existing active member's role is left as is.
  assert.deepEqual(upsertArgs!.update, { revokedAt: null });
  assert.deepEqual(upsertArgs!.create, { userId: "user_existing", companyId: "co_1", role: "MEMBER" });
});

test("linkVehicleToCompanyAction: ownership % is optional; without it no ownership snapshot is recorded", async () => {
  const actions = await import("../src/app/admin/actions.ts");
  setCurrentUser(REAL_USER);
  let agreement: Record<string, unknown> | undefined;
  let snapshots = 0;
  const db = makeAdminActionDbStub({
    falakRoles: ADMIN_ROLE,
    models: {
      company: { findUnique: async () => ({ id: "co_1", slug: "acme" }) },
      vehicle: { findUnique: async () => ({ id: "veh_1", slug: "fund-one" }) },
      ownershipPosition: {
        findFirst: async () => null,
        create: async ({ data }: { data: Record<string, unknown> }) => ({ id: "pos_new", ...data }),
      },
      investmentAgreement: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          agreement = data;
          return { id: "agr_new", ...data };
        },
      },
      ownershipSnapshot: {
        create: async () => {
          snapshots += 1;
          return {};
        },
      },
    },
  });
  setDbStub(db);

  const formData = new FormData();
  formData.set("companyId", "co_1");
  formData.set("vehicleId", "veh_1");
  formData.set("investedAmount", "126000");
  formData.set("currency", "USD");
  formData.set("ownershipPct", "");
  formData.set("signedDate", "2024-05-01");

  const result = await actions.linkVehicleToCompanyAction({ error: null }, formData);
  assert.equal(result.error, null);
  assert.equal(agreement?.ownershipPct, null);
  assert.equal(snapshots, 0);
});

test("createReportingCycleAction stores the statements ask per cycle: the year given, the year before the period ends, or none", async () => {
  const actions = await import("../src/app/admin/actions.ts");
  setCurrentUser(REAL_USER);
  const cases: [Record<string, string>, number | null][] = [
    [{ askStatements: "on", statementsYear: "2024" }, 2024],
    [{ askStatements: "on" }, 2025],
    [{ statementsYear: "2024" }, null],
  ];
  for (const [extra, expected] of cases) {
    const created: Record<string, unknown>[] = [];
    setDbStub(
      makeAdminActionDbStub({
        falakRoles: ADMIN_ROLE,
        models: {
          reportingCycle: {
            findUnique: async () => null,
            create: async ({ data }: { data: Record<string, unknown> }) => {
              created.push(data);
              return { id: "cycle_new", ...data };
            },
          },
          companySubmission: { create: async ({ data }: { data: Record<string, unknown> }) => ({ id: "sub_new", ...data }) },
        },
      })
    );
    const formData = new FormData();
    formData.append("companyIds", "co_1");
    formData.set("templateId", "tmpl_1");
    formData.set("periodLabel", "Q3 2026");
    formData.set("periodStart", "2026-07-01");
    formData.set("periodEnd", "2026-09-30");
    formData.set("deadline", "2026-10-15");
    for (const [k, v] of Object.entries(extra)) formData.set(k, v);
    const result = await actions.createReportingCycleAction({ error: null }, formData);
    assert.equal(result.error, null, JSON.stringify(extra));
    assert.equal(created[0].statementsYear, expected, JSON.stringify(extra));
  }
});

test("setRequestStatementsAction sets or clears the ask on every cycle in the request", async () => {
  const actions = await import("../src/app/admin/actions.ts");
  setCurrentUser(REAL_USER);
  const updates: Record<string, unknown>[] = [];
  const db = makeAdminActionDbStub({
    falakRoles: ADMIN_ROLE,
    models: {
      reportingCycle: {
        findMany: async () => [{ id: "cy_1" }, { id: "cy_2" }],
        updateMany: async (args: Record<string, unknown>) => {
          updates.push(args);
          return { count: 2 };
        },
      },
    },
  });
  setDbStub(db);
  const base = { templateId: "tmpl_1", periodStart: "2026-07-01", periodEnd: "2026-09-30" };
  const run = (extra: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries({ ...base, ...extra })) fd.set(k, v);
    return actions.setRequestStatementsAction({ error: null }, fd);
  };

  assert.equal((await run({ askStatements: "on", statementsYear: "2024" })).error, null);
  assert.deepEqual(updates[0], { where: { id: { in: ["cy_1", "cy_2"] } }, data: { statementsYear: 2024 } });
  assert.equal((await run({})).error, null);
  assert.deepEqual((updates[1] as { data: unknown }).data, { statementsYear: null });
  const bad = await run({ askStatements: "on", statementsYear: "25" });
  assert.ok(bad.fieldErrors?.statementsYear);
  assert.equal(updates.length, 2);
  assert.ok(db.getAuditEvents().some((e) => e.action === "reporting_request.statements_set"));
});

test("createReportingCycleAction: reminders are off unless ticked, and saved with their numbers when they are", async () => {
  const actions = await import("../src/app/admin/actions.ts");
  setCurrentUser(REAL_USER);
  const cases: [Record<string, string>, Record<string, unknown>][] = [
    [{}, { remindersEnabled: false, overdueRemindersEnabled: false }],
    [
      { remindersEnabled: "on", reminderStartDays: "10", reminderEveryDays: "3", overdueRemindersEnabled: "on", overdueEveryDays: "2", overdueForDays: "21" },
      { remindersEnabled: true, reminderStartDays: 10, reminderEveryDays: 3, overdueRemindersEnabled: true, overdueEveryDays: 2, overdueForDays: 21 },
    ],
    // Overdue ticked while reminders are off: still off.
    [{ overdueRemindersEnabled: "on" }, { remindersEnabled: false, overdueRemindersEnabled: false }],
  ];
  for (const [extra, expected] of cases) {
    const created: Record<string, unknown>[] = [];
    setDbStub(
      makeAdminActionDbStub({
        falakRoles: ADMIN_ROLE,
        models: {
          reportingCycle: {
            findUnique: async () => null,
            create: async ({ data }: { data: Record<string, unknown> }) => {
              created.push(data);
              return { id: "cycle_new", ...data };
            },
          },
          companySubmission: { create: async ({ data }: { data: Record<string, unknown> }) => ({ id: "sub_new", ...data }) },
        },
      })
    );
    const formData = new FormData();
    formData.append("companyIds", "co_1");
    for (const [k, v] of Object.entries({ templateId: "tmpl_1", periodLabel: "Q4 2026", periodStart: "2026-10-01", periodEnd: "2026-12-31", deadline: "2027-01-20", ...extra })) formData.set(k, v);
    const result = await actions.createReportingCycleAction({ error: null }, formData);
    assert.equal(result.error, null, JSON.stringify(extra));
    for (const [k, v] of Object.entries(expected)) assert.equal(created[0][k], v, `${k} for ${JSON.stringify(extra)}`);
  }
});

test("setRequestRemindersAction saves the settings on every cycle in the request and rejects out-of-range numbers", async () => {
  const actions = await import("../src/app/admin/actions.ts");
  setCurrentUser(REAL_USER);
  const updates: { data: Record<string, unknown> }[] = [];
  const db = makeAdminActionDbStub({
    falakRoles: ADMIN_ROLE,
    models: {
      reportingCycle: {
        findMany: async () => [{ id: "cy_1" }, { id: "cy_2" }],
        updateMany: async (args: { data: Record<string, unknown> }) => {
          updates.push(args);
          return { count: 2 };
        },
      },
    },
  });
  setDbStub(db);
  const run = (extra: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries({ templateId: "tmpl_1", periodStart: "2026-07-01", periodEnd: "2026-09-30", ...extra })) fd.set(k, v);
    return actions.setRequestRemindersAction({ error: null }, fd);
  };
  assert.equal((await run({ remindersEnabled: "on", reminderStartDays: "5", reminderEveryDays: "1" })).error, null);
  assert.equal(updates[0].data.remindersEnabled, true);
  assert.equal(updates[0].data.reminderStartDays, 5);
  assert.equal(updates[0].data.overdueRemindersEnabled, false);
  const bad = await run({ remindersEnabled: "on", reminderEveryDays: "0" });
  assert.ok(bad.fieldErrors?.reminderEveryDays);
  assert.equal(updates.length, 1);
  // Switching off never trips over a bad number in a hidden field.
  assert.equal((await run({ reminderEveryDays: "0" })).error, null);
  assert.equal(updates[1].data.remindersEnabled, false);
  assert.ok(db.getAuditEvents().some((e) => e.action === "reporting_request.reminders_set"));
});

test("createReportingCycleAction: with 'Email the request now' unticked, the cycle is created and no email is sent", async () => {
  const actions = await import("../src/app/admin/actions.ts");
  setCurrentUser(REAL_USER);
  const sent: unknown[] = [];
  (globalThis as Record<string, unknown>).__TEST_SEND_REPORT_REQUEST_EMAIL_STUB__ = async (...args: unknown[]) => {
    sent.push(args);
  };
  let created = 0;
  const companyLookups: unknown[] = [];
  setDbStub(
    makeAdminActionDbStub({
      falakRoles: ADMIN_ROLE,
      models: {
        reportingCycle: {
          findUnique: async () => null,
          create: async ({ data }: { data: Record<string, unknown> }) => ({ id: `cycle_${++created}`, ...data }),
        },
        companySubmission: { create: async ({ data }: { data: Record<string, unknown> }) => ({ id: "sub_new", ...data }) },
        company: {
          findMany: async (args: unknown) => {
            companyLookups.push(args);
            return [];
          },
        },
      },
    })
  );
  const formData = new FormData();
  formData.append("companyIds", "co_1");
  for (const [k, v] of Object.entries({ templateId: "tmpl_1", periodLabel: "Q2 2025", periodStart: "2025-04-01", periodEnd: "2025-06-30", deadline: "2025-07-31", emailChoice: "present" })) {
    formData.set(k, v);
  }
  const result = await actions.createReportingCycleAction({ error: null }, formData);
  assert.equal(result.error, null);
  assert.equal(created, 1);
  assert.match(result.notice ?? "", /without emailing/);
  assert.equal(sent.length, 0);
  assert.equal(companyLookups.length, 0, "the email step never ran");
  delete (globalThis as Record<string, unknown>).__TEST_SEND_REPORT_REQUEST_EMAIL_STUB__;
});
