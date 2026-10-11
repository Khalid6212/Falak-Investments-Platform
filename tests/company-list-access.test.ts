import { test } from "node:test";
import assert from "node:assert/strict";
import { setCurrentUser, setDbStub, makeAdminActionDbStub, REAL_USER } from "./support/stubs.ts";

// Imports the REAL production modules via tests/support/mock-loader.mjs.
const { getCompanyListData } = await import("../src/lib/admin/company-list.ts");
const { buildCompaniesWorkbook, buildPortfolioWorkbook } = await import("../src/lib/admin/exports.ts");
const { ForbiddenError } = await import("../src/lib/auth/authorization-errors.ts");

function stub(falakRoles: { role: string }[]) {
  const companyQueries: Record<string, unknown>[] = [];
  const db = makeAdminActionDbStub({
    falakRoles,
    models: {
      user: { findUnique: async () => ({ department: "InvestmentDepartment", allDepartments: false }) },
      company: {
        findMany: async (args: { where: Record<string, unknown> }) => {
          companyQueries.push(args.where);
          return [];
        },
      },
    },
  });
  return { db, companyQueries };
}

test("company list: Investment Professionals can open it, limited to their department", async () => {
  setCurrentUser(REAL_USER);
  const { db, companyQueries } = stub([{ role: "FALAK_OPERATIONS" }]);
  setDbStub(db);
  assert.deepEqual(await getCompanyListData(), []);
  assert.deepEqual(companyQueries[0].department, { in: ["InvestmentDepartment"] });
});

test("company list: someone with no staff role is refused", async () => {
  setCurrentUser(REAL_USER);
  setDbStub(stub([]).db);
  await assert.rejects(() => getCompanyListData(), ForbiddenError);
});

test("exports: staff may download the startups export; the portfolio export stays Management/Admin", async () => {
  setCurrentUser(REAL_USER);
  const { db, companyQueries } = stub([{ role: "FALAK_OPERATIONS" }]);
  setDbStub(db);
  assert.ok((await buildCompaniesWorkbook()).length > 0);
  assert.deepEqual(companyQueries[0].department, { in: ["InvestmentDepartment"] });
  await assert.rejects(() => buildPortfolioWorkbook(), ForbiddenError);
});
