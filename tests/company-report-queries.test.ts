import { test } from "node:test";
import assert from "node:assert/strict";
import { setCurrentUser, setDbStub, makeCompanyReportDbStub, REAL_USER } from "./support/stubs.ts";

// Imports the REAL production module -- src/lib/company/queries.ts -- and
// (transitively, unmodified) src/lib/auth/authorization.ts,
// authorization-errors.ts -- via tests/support/mock-loader.mjs.
const { getCompanyReportData } = await import("../src/lib/company/queries.ts");
const { UnauthenticatedError, ForbiddenError } = await import("../src/lib/auth/authorization-errors.ts");

const ADMIN_ROLE = [{ role: "FALAK_ADMIN" }];
const MEMBER_OF_CO1 = { userId: "user_1", companyId: "co_1", role: "MEMBER" };

const BASE_COMPANY = {
  id: "co_1",
  slug: "tadween-saas",
  nameEn: "Tadween SaaS",
  nameAr: "تدوين",
  sectorEn: "SaaS",
  sectorAr: "برمجيات",
  customerModel: "B2B",
  revenueModels: ["SaaS"],
  currency: "SAR",
  entryStage: "Seed",
  currentStage: "SeriesA",
};

const OTHER_COMPANY = { ...BASE_COMPANY, id: "co_2", slug: "other-co", nameEn: "Other Co" };

const Q1_CYCLE = {
  id: "cycle_1",
  periodLabel: "Q1 2026",
  periodStart: new Date("2026-01-01"),
  periodEnd: new Date("2026-03-31"),
  currentDeadline: new Date("2026-04-15"),
  submission: { id: "sub_1", status: "approved", updatedAt: new Date("2026-04-01"), revenue: 100000 },
};

test("unauthenticated caller is denied before any company lookup", async () => {
  setCurrentUser(null);
  const db = makeCompanyReportDbStub({ companies: [BASE_COMPANY] });
  setDbStub(db);
  await assert.rejects(() => getCompanyReportData("tadween-saas"), UnauthenticatedError);
  assert.equal(db.getFindUniqueCalls().length, 0);
});

test("unknown slug returns null", async () => {
  setCurrentUser(REAL_USER);
  setDbStub(makeCompanyReportDbStub({ falakRoles: ADMIN_ROLE, companies: [] }));
  const result = await getCompanyReportData("no-such-slug");
  assert.equal(result, null);
});

test("Falak staff can view a company they have no membership on", async () => {
  setCurrentUser(REAL_USER);
  setDbStub(makeCompanyReportDbStub({ falakRoles: ADMIN_ROLE, companies: [BASE_COMPANY] }));
  const result = await getCompanyReportData("tadween-saas");
  assert.ok(result);
  assert.equal(result!.viewerRole, "FALAK_STAFF");
});

test("that company's own MEMBER (no Falak role) can view it", async () => {
  setCurrentUser(REAL_USER);
  setDbStub(
    makeCompanyReportDbStub({ falakRoles: [], companyMemberships: [MEMBER_OF_CO1], companies: [BASE_COMPANY] })
  );
  const result = await getCompanyReportData("tadween-saas");
  assert.ok(result);
  assert.equal(result!.viewerRole, "COMPANY_MEMBER");
});

test("a MEMBER of a different company, no Falak role, is denied", async () => {
  setCurrentUser(REAL_USER);
  setDbStub(
    makeCompanyReportDbStub({
      falakRoles: [],
      companyMemberships: [{ userId: "user_1", companyId: "co_2", role: "MEMBER" }],
      companies: [BASE_COMPANY],
    })
  );
  await assert.rejects(() => getCompanyReportData("tadween-saas"), ForbiddenError);
});

test("authenticated, no Falak role, zero memberships anywhere -> denied", async () => {
  setCurrentUser(REAL_USER);
  setDbStub(makeCompanyReportDbStub({ falakRoles: [], companyMemberships: [], companies: [BASE_COMPANY] }));
  await assert.rejects(() => getCompanyReportData("tadween-saas"), ForbiddenError);
});

test("a revoked membership on the target company, no Falak role, is denied", async () => {
  setCurrentUser(REAL_USER);
  setDbStub(
    makeCompanyReportDbStub({
      falakRoles: [],
      companyMemberships: [{ ...MEMBER_OF_CO1, revoked: true }],
      companies: [BASE_COMPANY],
    })
  );
  await assert.rejects(() => getCompanyReportData("tadween-saas"), ForbiddenError);
});

test("a period whose Report's only version is superseded has narratives: []", async () => {
  setCurrentUser(REAL_USER);
  setDbStub(
    makeCompanyReportDbStub({
      falakRoles: ADMIN_ROLE,
      companies: [
        {
          ...BASE_COMPANY,
          cycles: [Q1_CYCLE],
          reports: [
            {
              periodStart: Q1_CYCLE.periodStart,
              periodEnd: Q1_CYCLE.periodEnd,
              versions: [{ isSuperseded: true, narratives: [{ kind: "quarter_highlights", textEn: "old", textAr: "قديم" }] }],
            },
          ],
        },
      ],
    })
  );
  const result = await getCompanyReportData("tadween-saas");
  assert.deepEqual(result!.company.periods["Q1 2026"].narratives, []);
});

test("a published (non-superseded) version with 2 of 4 narrative kinds surfaces exactly those", async () => {
  setCurrentUser(REAL_USER);
  setDbStub(
    makeCompanyReportDbStub({
      falakRoles: ADMIN_ROLE,
      companies: [
        {
          ...BASE_COMPANY,
          cycles: [Q1_CYCLE],
          reports: [
            {
              periodStart: Q1_CYCLE.periodStart,
              periodEnd: Q1_CYCLE.periodEnd,
              versions: [
                {
                  isSuperseded: false,
                  narratives: [
                    { kind: "operational_update", textEn: "Good quarter", textAr: "ربع جيد" },
                    { kind: "quarter_highlights", textEn: "Grew 20%", textAr: "نمو 20%" },
                  ],
                },
              ],
            },
          ],
        },
      ],
    })
  );
  const result = await getCompanyReportData("tadween-saas");
  const narratives = result!.company.periods["Q1 2026"].narratives;
  assert.equal(narratives.length, 2);
  assert.ok(narratives.some((n) => n.kind === "operational_update"));
  assert.ok(narratives.some((n) => n.kind === "quarter_highlights"));
});

test("a cycle with no matching Report row: narratives: [], revenue/status still populated", async () => {
  setCurrentUser(REAL_USER);
  setDbStub(makeCompanyReportDbStub({ falakRoles: ADMIN_ROLE, companies: [{ ...BASE_COMPANY, cycles: [Q1_CYCLE] }] }));
  const result = await getCompanyReportData("tadween-saas");
  const period = result!.company.periods["Q1 2026"];
  assert.deepEqual(period.narratives, []);
  assert.equal(period.revenue, 100000);
  assert.equal(period.status, "approved");
});

test("isNa true means no revenue value, not zero", async () => {
  setCurrentUser(REAL_USER);
  const cycle = { ...Q1_CYCLE, submission: { ...Q1_CYCLE.submission, revenue: 0, isNa: true } };
  setDbStub(makeCompanyReportDbStub({ falakRoles: ADMIN_ROLE, companies: [{ ...BASE_COMPANY, cycles: [cycle] }] }));
  const result = await getCompanyReportData("tadween-saas");
  assert.equal(result!.company.periods["Q1 2026"].revenue, null);
});

test("a cycle with no submission at all -> status draft, revenue null, lastUpdated null", async () => {
  setCurrentUser(REAL_USER);
  const cycle = { ...Q1_CYCLE, submission: null };
  setDbStub(makeCompanyReportDbStub({ falakRoles: ADMIN_ROLE, companies: [{ ...BASE_COMPANY, cycles: [cycle] }] }));
  const result = await getCompanyReportData("tadween-saas");
  const period = result!.company.periods["Q1 2026"];
  assert.equal(period.status, "draft");
  assert.equal(period.revenue, null);
  assert.equal(period.lastUpdated, null);
  assert.equal(period.submissionId, null);
});

test("two companies' cycles both in the fixture set: only the target company's periods appear", async () => {
  setCurrentUser(REAL_USER);
  const otherCycle = { ...Q1_CYCLE, id: "cycle_2", periodLabel: "Q9 9999" };
  setDbStub(
    makeCompanyReportDbStub({
      falakRoles: ADMIN_ROLE,
      companies: [{ ...BASE_COMPANY, cycles: [Q1_CYCLE] }, { ...OTHER_COMPANY, cycles: [otherCycle] }],
    })
  );
  const result = await getCompanyReportData("tadween-saas");
  assert.deepEqual(Object.keys(result!.company.periods), ["Q1 2026"]);
  assert.deepEqual(
    result!.periods.map((p) => p.key),
    ["Q1 2026"]
  );
});

test("a Falak-staff viewer gets a populated benchmarks array (computed via getPortfolioBenchmarks)", async () => {
  setCurrentUser(REAL_USER);
  const db = makeCompanyReportDbStub({ falakRoles: ADMIN_ROLE, companies: [{ ...BASE_COMPANY, cycles: [Q1_CYCLE] }] });
  setDbStub(db);
  const result = await getCompanyReportData("tadween-saas");
  assert.ok(Array.isArray(result!.company.periods["Q1 2026"].benchmarks));
  assert.ok(db.getCompanyFindManyCallCount() > 0, "a staff viewer must trigger getPortfolioBenchmarks' own company.findMany");
});

test("a company-member viewer always gets an empty benchmarks array, and getPortfolioBenchmarks is never called", async () => {
  setCurrentUser(REAL_USER);
  const db = makeCompanyReportDbStub({
    falakRoles: [],
    companyMemberships: [MEMBER_OF_CO1],
    companies: [{ ...BASE_COMPANY, cycles: [Q1_CYCLE] }],
  });
  setDbStub(db);
  const result = await getCompanyReportData("tadween-saas");
  assert.deepEqual(result!.company.periods["Q1 2026"].benchmarks, []);
  assert.equal(db.getCompanyFindManyCallCount(), 0, "a company member must never trigger the portfolio-wide benchmark query");
});

const FUND_LINK = {
  vehicle: { id: "veh_1", slug: "fund-one", nameEn: "Fund One", nameAr: "الصندوق الأول", type: "Fund", currency: "USD" },
  agreements: [{ signedDate: new Date("2024-05-01"), investedAmount: 126000, currency: "USD", ownershipPct: null }],
};

test("profile data: each period carries its template name and whether it was published", async () => {
  setCurrentUser(REAL_USER);
  setDbStub(makeCompanyReportDbStub({ falakRoles: ADMIN_ROLE, companies: [{ ...BASE_COMPANY, cycles: [Q1_CYCLE] }] }));
  const period = (await getCompanyReportData("tadween-saas"))!.company.periods["Q1 2026"];
  assert.equal(period.templateNameEn, "Quarterly Report");
  assert.equal(period.isPublished, false);
});

test("profile data: Falak staff see investment agreements; the startup's own members never do", async () => {
  setCurrentUser(REAL_USER);
  setDbStub(makeCompanyReportDbStub({ falakRoles: ADMIN_ROLE, companies: [{ ...BASE_COMPANY, vehicleLinks: [FUND_LINK] }] }));
  const staff = await getCompanyReportData("tadween-saas");
  assert.deepEqual(staff!.investments, [
    {
      id: "agr_1",
      vehicleId: "veh_1",
      vehicleSlug: "fund-one",
      vehicleNameEn: "Fund One",
      vehicleNameAr: "الصندوق الأول",
      signedDate: "2024-05-01",
      investedAmount: 126000,
      currency: "USD",
      ownershipPct: null,
    },
  ]);

  setDbStub(
    makeCompanyReportDbStub({
      falakRoles: [],
      companyMemberships: [MEMBER_OF_CO1],
      companies: [{ ...BASE_COMPANY, vehicleLinks: [FUND_LINK] }],
    })
  );
  const member = await getCompanyReportData("tadween-saas");
  assert.deepEqual(member!.investments, []);
  assert.equal(member!.canManageInvestments, false);
  assert.equal(staff!.canManageInvestments, true, "Admin");
});
