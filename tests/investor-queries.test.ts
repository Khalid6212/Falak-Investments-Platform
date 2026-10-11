import { test } from "node:test";
import assert from "node:assert/strict";
import { setCurrentUser, setDbStub, makeInvestorQueriesDbStub, REAL_USER } from "./support/stubs.ts";

// Imports the REAL production module -- src/lib/investor/queries.ts --
// and (transitively, unmodified) src/lib/auth/authorization.ts,
// authorization-errors.ts -- via tests/support/mock-loader.mjs.
const { getInvestorPortfolioData } = await import("../src/lib/investor/queries.ts");
const { UnauthenticatedError } = await import("../src/lib/auth/authorization-errors.ts");

const MEMBERSHIP = {
  userId: "user_1",
  investorId: "inv_1",
  investorNameEn: "Nawras Capital",
  investorNameAr: "نورس كابيتال",
};

const BASE_GRANT = {
  investorId: "inv_1",
  reportVersionId: "ver_1",
  versionNo: 1,
  publishedAt: new Date("2026-04-15"),
  reportId: "rep_1",
  periodLabel: "Q1 2026",
  periodStart: new Date("2026-01-01"),
  periodEnd: new Date("2026-03-31"),
  companyId: "co_1",
  companyNameEn: "Tadween SaaS",
  companyNameAr: "تدوين",
  companySlug: "tadween-saas",
  companySectorEn: "SaaS",
  companySectorAr: "برمجيات",
  companyCustomerModel: "B2B",
  companyRevenueModels: ["SaaS"],
  companyCurrency: "SAR",
  companyEntryStage: "Seed",
  companyCurrentStage: "SeriesA",
  submissionId: "sub_1",
  revenue: 100000,
};

test("unauthenticated caller is denied", async () => {
  setCurrentUser(null);
  setDbStub(makeInvestorQueriesDbStub({}));
  await assert.rejects(() => getInvestorPortfolioData(), UnauthenticatedError);
});

test("zero memberships -> all-empty result, no throw", async () => {
  setCurrentUser(REAL_USER);
  setDbStub(makeInvestorQueriesDbStub({ memberships: [] }));
  const result = await getInvestorPortfolioData();
  assert.deepEqual(result, { orgs: [], periods: [], companies: [], vehicleExposures: [], news: [] });
});

test("a revoked membership grants no org access", async () => {
  setCurrentUser(REAL_USER);
  setDbStub(makeInvestorQueriesDbStub({ memberships: [{ ...MEMBERSHIP, revoked: true }] }));
  const result = await getInvestorPortfolioData();
  assert.equal(result.orgs.length, 0);
});

test("a membership on an archived investor grants no org access", async () => {
  setCurrentUser(REAL_USER);
  setDbStub(makeInvestorQueriesDbStub({ memberships: [{ ...MEMBERSHIP, investorArchived: true }] }));
  const result = await getInvestorPortfolioData();
  assert.equal(result.orgs.length, 0);
});

test("a valid grant surfaces one visible company with the right period and revenue", async () => {
  setCurrentUser(REAL_USER);
  setDbStub(
    makeInvestorQueriesDbStub({
      memberships: [MEMBERSHIP],
      reportAccessGrants: [BASE_GRANT],
    })
  );
  const result = await getInvestorPortfolioData();

  assert.equal(result.orgs.length, 1);
  assert.equal(result.orgs[0].id, "inv_1");
  assert.equal(result.periods.length, 1);
  assert.equal(result.periods[0].key, "Q1 2026");
  assert.equal(result.companies.length, 1);
  assert.equal(result.companies[0].id, "co_1");
  assert.equal(result.companies[0].revenue, 100000);
  assert.equal(result.companies[0].periodKey, "Q1 2026");
  assert.equal(result.companies[0].investorOrgId, "inv_1");
});

test("only the highest-versionNo grant per (investor, report) surfaces", async () => {
  setCurrentUser(REAL_USER);
  setDbStub(
    makeInvestorQueriesDbStub({
      memberships: [MEMBERSHIP],
      reportAccessGrants: [
        { ...BASE_GRANT, reportVersionId: "ver_1", versionNo: 1, revenue: 50000 },
        { ...BASE_GRANT, reportVersionId: "ver_2", versionNo: 2, revenue: 75000 },
      ],
    })
  );
  const result = await getInvestorPortfolioData();
  assert.equal(result.companies.length, 1);
  assert.equal(result.companies[0].revenue, 75000);
});

test("a revoked grant is excluded", async () => {
  setCurrentUser(REAL_USER);
  setDbStub(
    makeInvestorQueriesDbStub({
      memberships: [MEMBERSHIP],
      reportAccessGrants: [{ ...BASE_GRANT, revoked: true }],
    })
  );
  const result = await getInvestorPortfolioData();
  assert.equal(result.companies.length, 0);
  assert.equal(result.periods.length, 0);
});

test("an archived company's grant is excluded", async () => {
  setCurrentUser(REAL_USER);
  setDbStub(
    makeInvestorQueriesDbStub({
      memberships: [MEMBERSHIP],
      reportAccessGrants: [{ ...BASE_GRANT, companyArchived: true }],
    })
  );
  const result = await getInvestorPortfolioData();
  assert.equal(result.companies.length, 0);
});

test("a non-COMPANY-scope grant never leaks into companies", async () => {
  setCurrentUser(REAL_USER);
  setDbStub(
    makeInvestorQueriesDbStub({
      memberships: [MEMBERSHIP],
      reportAccessGrants: [{ ...BASE_GRANT, scope: "INVESTOR_PORTFOLIO" }],
    })
  );
  const result = await getInvestorPortfolioData();
  assert.equal(result.companies.length, 0);
});

test("isNa true means no revenue value, not zero or excluded-as-missing", async () => {
  setCurrentUser(REAL_USER);
  setDbStub(
    makeInvestorQueriesDbStub({
      memberships: [MEMBERSHIP],
      reportAccessGrants: [{ ...BASE_GRANT, revenue: 0, isNa: true }],
    })
  );
  const result = await getInvestorPortfolioData();
  assert.equal(result.companies.length, 1);
  assert.equal(result.companies[0].revenue, null);
});

test("no metric value at all -> revenue is null, company still visible", async () => {
  setCurrentUser(REAL_USER);
  setDbStub(
    makeInvestorQueriesDbStub({
      memberships: [MEMBERSHIP],
      reportAccessGrants: [{ ...BASE_GRANT, revenue: null }],
    })
  );
  const result = await getInvestorPortfolioData();
  assert.equal(result.companies.length, 1);
  assert.equal(result.companies[0].revenue, null);
});

test("vehicle exposure: Active surfaces, Exited is excluded, direct investor position contributes to companies but no vehicle card", async () => {
  setCurrentUser(REAL_USER);
  setDbStub(
    makeInvestorQueriesDbStub({
      memberships: [MEMBERSHIP],
      reportAccessGrants: [BASE_GRANT],
      investorVehiclePositions: [
        { investorId: "inv_1", vehicleId: "veh_1", status: "Active" },
        { investorId: "inv_1", vehicleId: "veh_2", status: "Exited" },
      ],
      vehicles: [
        { id: "veh_1", slug: "fund-one", nameEn: "Fund One", nameAr: "الصندوق الأول", type: "Fund", currency: "SAR" },
        { id: "veh_2", slug: "fund-two", nameEn: "Fund Two", nameAr: "الصندوق الثاني", type: "Fund", currency: "SAR" },
      ],
      ownershipLinks: [{ vehicleId: "veh_1", companyId: "co_1" }],
    })
  );
  const result = await getInvestorPortfolioData();
  assert.equal(result.vehicleExposures.length, 1);
  assert.equal(result.vehicleExposures[0].id, "veh_1");
  assert.deepEqual(result.vehicleExposures[0].linkedCompanies.map((c) => c.id), ["co_1"]);
  // The company itself is still visible via its own direct grant, independent of vehicle exposure.
  assert.equal(result.companies.length, 1);
});

test("vehicle exposure lists linked companies by name even when no report has ever been published for them", async () => {
  setCurrentUser(REAL_USER);
  setDbStub(
    makeInvestorQueriesDbStub({
      memberships: [MEMBERSHIP],
      reportAccessGrants: [],
      investorVehiclePositions: [{ investorId: "inv_1", vehicleId: "veh_1", status: "Active" }],
      vehicles: [{ id: "veh_1", slug: "fund-one", nameEn: "Fund One", nameAr: "الصندوق الأول", type: "Fund", currency: "SAR" }],
      ownershipLinks: [{ vehicleId: "veh_1", companyId: "co_1", companyNameEn: "Waslah Logistics", companySlug: "waslah" }],
    })
  );
  const result = await getInvestorPortfolioData();
  assert.equal(result.companies.length, 0, "no published report, so no grant-based company entry");
  assert.equal(result.vehicleExposures[0].linkedCompanies.length, 1);
  assert.equal(result.vehicleExposures[0].linkedCompanies[0].nameEn, "Waslah Logistics");
  assert.equal(result.vehicleExposures[0].linkedCompanies[0].slug, "waslah");
});

test("two Active positions on the same vehicle (different effectiveFrom) dedupe to one exposure entry", async () => {
  setCurrentUser(REAL_USER);
  setDbStub(
    makeInvestorQueriesDbStub({
      memberships: [MEMBERSHIP],
      reportAccessGrants: [],
      investorVehiclePositions: [
        { investorId: "inv_1", vehicleId: "veh_1", status: "Active" },
        { investorId: "inv_1", vehicleId: "veh_1", status: "Active" },
      ],
      vehicles: [{ id: "veh_1", slug: "fund-one", nameEn: "Fund One", nameAr: "الصندوق الأول", type: "Fund", currency: "SAR" }],
      ownershipLinks: [],
    })
  );
  const result = await getInvestorPortfolioData();
  assert.equal(result.vehicleExposures.length, 1);
});

test("an archived vehicle is excluded from exposure cards", async () => {
  setCurrentUser(REAL_USER);
  setDbStub(
    makeInvestorQueriesDbStub({
      memberships: [MEMBERSHIP],
      reportAccessGrants: [],
      investorVehiclePositions: [{ investorId: "inv_1", vehicleId: "veh_1", status: "Active" }],
      vehicles: [
        { id: "veh_1", slug: "fund-one", nameEn: "Fund One", nameAr: "الصندوق الأول", type: "Fund", currency: "SAR", archivedAt: new Date() },
      ],
      ownershipLinks: [],
    })
  );
  const result = await getInvestorPortfolioData();
  assert.equal(result.vehicleExposures.length, 0);
});

test("vehicle exposure carries this org's contributions, its share of all contributions, NAV history, and sectors", async () => {
  setCurrentUser(REAL_USER);
  setDbStub(
    makeInvestorQueriesDbStub({
      memberships: [MEMBERSHIP],
      reportAccessGrants: [],
      investorVehiclePositions: [
        { investorId: "inv_1", vehicleId: "veh_1", status: "Active", commitmentAmount: 750_000, currency: "SAR" },
        // Another investor in the same vehicle: 100,000 USD = 375,000 SAR.
        { investorId: "inv_other", vehicleId: "veh_1", status: "Active", commitmentAmount: 100_000, currency: "USD" },
        { investorId: "inv_other", vehicleId: "veh_1", status: "Exited", commitmentAmount: 9_000_000, currency: "SAR" },
      ],
      vehicles: [{ id: "veh_1", slug: "fund-one", nameEn: "Fund One", nameAr: "الصندوق الأول", type: "Fund", currency: "SAR" }],
      ownershipLinks: [{ vehicleId: "veh_1", companyId: "co_1", companySectorEn: "Fintech", companySectorAr: "تقنية مالية" }],
      navSnapshots: [
        { vehicleId: "veh_1", asOfDate: new Date("2026-06-30"), navAmount: 3_000_000, currency: "SAR" },
        { vehicleId: "veh_1", asOfDate: new Date("2026-03-31"), navAmount: 2_000_000, currency: "SAR" },
      ],
    })
  );
  const [exposure] = (await getInvestorPortfolioData()).vehicleExposures;
  assert.deepEqual(exposure.contributions, [{ amount: 750_000, currency: "SAR" }]);
  assert.ok(Math.abs(exposure.ownershipShare! - 750_000 / 1_125_000) < 1e-12);
  assert.deepEqual(
    exposure.navHistory.map((n) => n.asOfDate),
    ["2026-03-31", "2026-06-30"]
  );
  assert.equal(exposure.linkedCompanies[0].sectorEn, "Fintech");
});

test("news: each startup's Investment Review Notes from its latest visible report, newest first", async () => {
  setCurrentUser(REAL_USER);
  setDbStub(
    makeInvestorQueriesDbStub({
      memberships: [MEMBERSHIP],
      reportAccessGrants: [
        { ...BASE_GRANT, reviewNotes: { textEn: "Q1 notes", textAr: "ملاحظات" } },
        {
          ...BASE_GRANT,
          reportId: "rep_2",
          reportVersionId: "ver_2",
          periodLabel: "Q2 2026",
          periodStart: new Date("2026-04-01"),
          periodEnd: new Date("2026-06-30"),
          publishedAt: new Date("2026-07-15"),
          reviewNotes: { textEn: "Q2 notes", textAr: "ملاحظات" },
        },
        {
          ...BASE_GRANT,
          reportId: "rep_3",
          reportVersionId: "ver_3",
          companyId: "co_2",
          companySlug: "waslah",
          companyNameEn: "Waslah",
          publishedAt: new Date("2026-05-01"),
          reviewNotes: { textEn: "Waslah notes", textAr: "" },
        },
      ],
    })
  );
  const { news } = await getInvestorPortfolioData();
  assert.deepEqual(
    news.map((n) => [n.companyId, n.periodKey, n.textEn]),
    [
      ["co_1", "Q2 2026", "Q2 notes"],
      ["co_2", "Q1 2026", "Waslah notes"],
    ]
  );
});

test("news: a startup whose latest report has no review notes shows no news, not older notes", async () => {
  setCurrentUser(REAL_USER);
  setDbStub(
    makeInvestorQueriesDbStub({
      memberships: [MEMBERSHIP],
      reportAccessGrants: [
        { ...BASE_GRANT, reviewNotes: { textEn: "Old Q1 notes", textAr: "" } },
        {
          ...BASE_GRANT,
          reportId: "rep_2",
          reportVersionId: "ver_2",
          periodLabel: "Q2 2026",
          periodStart: new Date("2026-04-01"),
          periodEnd: new Date("2026-06-30"),
        },
      ],
    })
  );
  const { news } = await getInvestorPortfolioData();
  assert.equal(news.length, 0);
});

test("startup-level exposure: a deal-by-deal investor's vehicle card lists only their selected startups", async () => {
  setCurrentUser(REAL_USER);
  setDbStub(
    makeInvestorQueriesDbStub({
      memberships: [MEMBERSHIP],
      reportAccessGrants: [],
      investorVehiclePositions: [{ investorId: "inv_1", vehicleId: "veh_1", status: "Active", exposureScope: "SELECTED", exposedCompanyIds: ["co_2"] }],
      vehicles: [{ id: "veh_1", slug: "angels-spv", nameEn: "Angels SPV", nameAr: "صندوق الملائكة", type: "SPV", currency: "USD" }],
      ownershipLinks: [
        { vehicleId: "veh_1", companyId: "co_1", companyNameEn: "Waslah Logistics", companySlug: "waslah" },
        { vehicleId: "veh_1", companyId: "co_2", companyNameEn: "Thakaa Med", companySlug: "thakaa-med" },
      ],
    })
  );
  const result = await getInvestorPortfolioData();
  assert.deepEqual(
    result.vehicleExposures[0].linkedCompanies.map((c) => c.nameEn),
    ["Thakaa Med"]
  );
});
