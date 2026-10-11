import { test } from "node:test";
import assert from "node:assert/strict";
import { setCurrentUser, setDbStub, makePublishWorkflowDbStub, REAL_USER } from "./support/stubs.ts";

// Imports the REAL production module -- src/lib/reporting/publish-workflow.ts
// -- and (transitively, unmodified) src/lib/auth/authorization.ts,
// authorization-errors.ts, src/lib/reporting/submission-errors.ts -- via
// tests/support/mock-loader.mjs.
const { publishSubmission } = await import("../src/lib/reporting/publish-workflow.ts");
const { InvalidTransitionError } = await import("../src/lib/reporting/submission-errors.ts");
const { ForbiddenError } = await import("../src/lib/auth/authorization-errors.ts");

const NO_ROLE: { role: string; revoked?: boolean }[] = [];
const OPERATIONS_ROLE = [{ role: "FALAK_OPERATIONS" }];
const ADMIN_ROLE = [{ role: "FALAK_ADMIN" }];

const BASE_SUBMISSION = {
  id: "sub_1",
  status: "approved",
  companyId: "co_1",
  periodLabel: "Q2 2026",
  periodStart: new Date("2026-04-01"),
  periodEnd: new Date("2026-06-30"),
};

const NO_NARRATIVES = {};

// A mixed ownership graph exercising every path: one vehicle-mediated
// investor (Active), one direct investor, one vehicle-mediated investor
// excluded for being Exited, and one DIRECT_FALAK holder (never produces
// investor access).
const MIXED_OWNERSHIP = [
  { companyId: "co_1", holderType: "VEHICLE", vehicleId: "veh_1" },
  { companyId: "co_1", holderType: "DIRECT_INVESTOR", investorId: "inv_direct" },
  { companyId: "co_1", holderType: "DIRECT_FALAK" },
];
const MIXED_POSITIONS = [
  { vehicleId: "veh_1", investorId: "inv_active", status: "Active" },
  { vehicleId: "veh_1", investorId: "inv_exited", status: "Exited" },
];
const MIXED_INVESTORS = [
  { id: "inv_active", archivedAt: null },
  { id: "inv_direct", archivedAt: null },
  { id: "inv_exited", archivedAt: null },
];

// ============================================================
// Authorization
// ============================================================

test("publishSubmission denies a caller with no Falak role", async () => {
  setCurrentUser(REAL_USER);
  setDbStub(makePublishWorkflowDbStub({ falakRoles: NO_ROLE, submission: BASE_SUBMISSION }));
  await assert.rejects(() => publishSubmission("sub_1", NO_NARRATIVES), ForbiddenError);
});

test("publishSubmission denies a FALAK_OPERATIONS-only caller (ADMIN-only gate, unlike approveSubmission)", async () => {
  setCurrentUser(REAL_USER);
  setDbStub(makePublishWorkflowDbStub({ falakRoles: OPERATIONS_ROLE, submission: BASE_SUBMISSION }));
  await assert.rejects(() => publishSubmission("sub_1", NO_NARRATIVES), ForbiddenError);
});

// ============================================================
// Status gate
// ============================================================

test("publishSubmission is blocked unless the submission is approved", async () => {
  for (const wrongStatus of ["draft", "submitted", "under_review", "changes_requested"]) {
    setCurrentUser(REAL_USER);
    const db = makePublishWorkflowDbStub({
      falakRoles: ADMIN_ROLE,
      submission: { ...BASE_SUBMISSION, status: wrongStatus },
    });
    setDbStub(db);
    await assert.rejects(() => publishSubmission("sub_1", NO_NARRATIVES), InvalidTransitionError);
    assert.equal(db.getReports().length, 0);
  }
});

test("publishSubmission is blocked for an approved submission whose company is archived", async () => {
  setCurrentUser(REAL_USER);
  const db = makePublishWorkflowDbStub({
    falakRoles: ADMIN_ROLE,
    submission: { ...BASE_SUBMISSION, companyArchived: true },
  });
  setDbStub(db);
  await assert.rejects(() => publishSubmission("sub_1", NO_NARRATIVES), InvalidTransitionError);
});

// ============================================================
// First publish
// ============================================================

test("first publish creates a Report, version 1, the submission link, and resolves investor access correctly", async () => {
  setCurrentUser(REAL_USER);
  const db = makePublishWorkflowDbStub({
    falakRoles: ADMIN_ROLE,
    submission: BASE_SUBMISSION,
    ownershipPositions: MIXED_OWNERSHIP,
    investorVehiclePositions: MIXED_POSITIONS,
    investors: MIXED_INVESTORS,
  });
  setDbStub(db);

  const result = await publishSubmission("sub_1", NO_NARRATIVES);
  assert.equal(result.versionNo, 1);

  assert.equal(db.getReports().length, 1);
  const report = db.getReports()[0];
  assert.equal(report.scope, "COMPANY");
  assert.equal(report.companyId, "co_1");
  assert.equal(report.status, "published");

  assert.equal(db.getReportVersions().length, 1);
  const version = db.getReportVersions()[0];
  assert.equal(version.versionNo, 1);
  assert.equal(version.isSuperseded, false);
  assert.ok(version.publishedAt);

  assert.equal(db.getReportVersionSubmissions().length, 1);
  assert.equal(db.getReportVersionSubmissions()[0].submissionId, "sub_1");

  const grantedInvestorIds = db.getReportAccessGrants().map((g) => g.investorId).sort();
  assert.deepEqual(grantedInvestorIds, ["inv_active", "inv_direct"]);
});

// ============================================================
// Second publish (correction)
// ============================================================

test("a second publish for the same company/period reuses the Report, increments versionNo, and supersedes the prior version", async () => {
  setCurrentUser(REAL_USER);
  const db = makePublishWorkflowDbStub({
    falakRoles: ADMIN_ROLE,
    submission: BASE_SUBMISSION,
    ownershipPositions: MIXED_OWNERSHIP,
    investorVehiclePositions: MIXED_POSITIONS,
    investors: MIXED_INVESTORS,
  });
  setDbStub(db);

  const first = await publishSubmission("sub_1", NO_NARRATIVES);
  assert.equal(first.versionNo, 1);
  const second = await publishSubmission("sub_1", NO_NARRATIVES);
  assert.equal(second.versionNo, 2);

  assert.equal(db.getReports().length, 1, "publishing again must reuse the same Report row, not create a second one");
  assert.equal(db.getReportVersions().length, 2);

  const [v1, v2] = db.getReportVersions();
  assert.equal(v1.isSuperseded, true, "the prior version must be marked superseded");
  assert.equal(v2.isSuperseded, false);

  // Each version gets its own independent access-grant set.
  assert.equal(db.getReportAccessGrants().length, 4);
});

// ============================================================
// Narrative sections
// ============================================================

test("a narrative kind with both languages blank is never created; a kind with only Arabic filled stores textEn as an empty string", async () => {
  setCurrentUser(REAL_USER);
  const db = makePublishWorkflowDbStub({ falakRoles: ADMIN_ROLE, submission: BASE_SUBMISSION });
  setDbStub(db);

  await publishSubmission("sub_1", {
    operational_update: { textEn: "", textAr: "" },
    quarter_highlights: { textEn: "", textAr: "تحديث" },
    investment_review_notes: { textEn: "  ", textAr: "  " },
  });

  const sections = db.getNarrativeSections();
  assert.equal(sections.length, 1);
  assert.equal(sections[0].kind, "quarter_highlights");
  assert.equal(sections[0].textEn, "");
  assert.equal(sections[0].textAr, "تحديث");
});

test("startup-level exposure: a deal-by-deal investor gets a startup's report only when selected for it", async () => {
  setCurrentUser(REAL_USER);
  const db = makePublishWorkflowDbStub({
    falakRoles: ADMIN_ROLE,
    submission: BASE_SUBMISSION,
    ownershipPositions: [{ companyId: "co_1", holderType: "VEHICLE", vehicleId: "veh_1" }],
    investorVehiclePositions: [
      { vehicleId: "veh_1", investorId: "inv_pooled", status: "Active" },
      { vehicleId: "veh_1", investorId: "inv_selected", status: "Active", exposureScope: "SELECTED", exposedCompanyIds: ["co_1"] },
      { vehicleId: "veh_1", investorId: "inv_other_deal", status: "Active", exposureScope: "SELECTED", exposedCompanyIds: ["co_2"] },
    ],
    investors: [
      { id: "inv_pooled", archivedAt: null },
      { id: "inv_selected", archivedAt: null },
      { id: "inv_other_deal", archivedAt: null },
    ],
  });
  setDbStub(db);

  await publishSubmission("sub_1", NO_NARRATIVES);
  const granted = db.getReportAccessGrants().map((g) => g.investorId).sort();
  assert.deepEqual(granted, ["inv_pooled", "inv_selected"]);
});
