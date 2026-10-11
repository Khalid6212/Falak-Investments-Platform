import { test } from "node:test";
import assert from "node:assert/strict";

const { validateCompany, validateVehicle, validateInvestor } = await import("../src/lib/admin/entity-validation.ts");

function form(fields: Record<string, string | string[]>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    for (const item of Array.isArray(v) ? v : [v]) fd.append(k, item);
  }
  return fd;
}

const GOOD_COMPANY = {
  slug: "startup-x",
  nameEn: "Startup X",
  nameAr: "ستارت أب",
  industry: "Fintech",
  sectorEn: "ignored when a listed industry is chosen",
  sectorAr: "تقنية مالية",
  customerModel: "B2B",
  currency: "SAR",
  entryStage: "Seed",
  currentStage: "SeriesA",
  department: "VentureBuilder",
  revenueModels: ["SaaS", "Marketplace"],
};

test("a valid company passes, with typed input", () => {
  const { errors, input } = validateCompany(form(GOOD_COMPANY), null);
  assert.deepEqual(errors, {});
  assert.deepEqual(input?.revenueModels, ["SaaS", "Marketplace"]);
});

test("only the bad company fields are flagged, and every submitted value comes back", () => {
  const { errors, input, values } = validateCompany(form({ ...GOOD_COMPANY, slug: "Startup X", currency: "" }), null);
  assert.equal(input, null);
  assert.deepEqual(Object.keys(errors).sort(), ["currency", "slug"]);
  assert.equal(values.nameEn, "Startup X");
  assert.equal(values.slug, "Startup X");
  assert.deepEqual(values.revenueModels, ["SaaS", "Marketplace"]);
});

test("a department outside the caller's scope is flagged on the department field", () => {
  const { errors } = validateCompany(form(GOOD_COMPANY), ["InvestmentDepartment"]);
  assert.deepEqual(Object.keys(errors), ["department"]);
});

test("vehicle: vintage year is optional but must be a sensible year", () => {
  const base = { slug: "fund-1", nameEn: "Fund 1", nameAr: "صندوق", type: "Fund", currency: "USD", department: "InvestmentDepartment" };
  assert.equal(validateVehicle(form({ ...base, vintageYear: "" }), null).input?.vintageYear, null);
  assert.equal(validateVehicle(form({ ...base, vintageYear: "2024" }), null).input?.vintageYear, 2024);
  assert.deepEqual(Object.keys(validateVehicle(form({ ...base, vintageYear: "24" }), null).errors), ["vintageYear"]);
});

test("investor: missing name and type are each flagged", () => {
  const { errors } = validateInvestor(form({ nameEn: "", nameAr: "LP", type: "", department: "VentureBuilder" }), null);
  assert.deepEqual(Object.keys(errors).sort(), ["nameEn", "type"]);
});

test("a listed industry supplies both labels; Other uses the typed ones", () => {
  const listed = validateCompany(form(GOOD_COMPANY), null).input;
  assert.equal(listed?.sectorEn, "Fintech");
  assert.equal(listed?.sectorAr, "التقنية المالية");

  const other = validateCompany(form({ ...GOOD_COMPANY, industry: "Other", sectorEn: "Pet Care", sectorAr: "رعاية الحيوانات" }), null).input;
  assert.equal(other?.sectorEn, "Pet Care");

  const missing = validateCompany(form({ ...GOOD_COMPANY, industry: "Other", sectorEn: "", sectorAr: "" }), null);
  assert.deepEqual(Object.keys(missing.errors).sort(), ["sectorAr", "sectorEn"]);
  assert.deepEqual(Object.keys(validateCompany(form({ ...GOOD_COMPANY, industry: "" }), null).errors), ["industry"]);
});

test("new business models and stages are accepted", () => {
  for (const customerModel of ["B2B2C", "B2G", "C2C", "D2C"]) {
    assert.ok(validateCompany(form({ ...GOOD_COMPANY, customerModel }), null).input, customerModel);
  }
  for (const stage of ["BridgeToSeed", "PreSeriesA", "BridgeToSeriesA"]) {
    assert.ok(validateCompany(form({ ...GOOD_COMPANY, entryStage: stage, currentStage: stage }), null).input, stage);
  }
});

test("founder and HQ are optional, but checked when given", () => {
  const empty = validateCompany(form(GOOD_COMPANY), null).input;
  assert.equal(empty?.founderEmail, null);
  assert.equal(empty?.hqCountry, null);

  const full = validateCompany(
    form({ ...GOOD_COMPANY, founderName: "Sara", founderEmail: "Sara@Startup.SA", founderPhone: "+966 55 123 4567", hqCity: "Riyadh", hqCountry: "SA" }),
    null
  ).input;
  assert.equal(full?.founderEmail, "sara@startup.sa");
  assert.equal(full?.hqCountry, "SA");

  const bad = validateCompany(form({ ...GOOD_COMPANY, founderEmail: "not-an-email", founderPhone: "abc", hqCountry: "XX" }), null);
  assert.deepEqual(Object.keys(bad.errors).sort(), ["founderEmail", "founderPhone", "hqCountry"]);
});

test("investor: contact details and brief are optional; given ones are checked and tidied", () => {
  const base = { nameEn: "Gulf LP", nameAr: "شريك الخليج", type: "Institutional", department: "InvestmentDepartment" };

  const empty = validateInvestor(form(base), null);
  assert.equal(empty.input?.contactEmail, null);
  assert.equal(empty.input?.contactPhone, null);
  assert.equal(empty.input?.briefEn, null);

  const full = validateInvestor(
    form({ ...base, contactEmail: " Ops@GulfLP.com ", contactPhone: "+966 55 123 4567", briefEn: "Long-term LP.", briefAr: "شريك طويل الأجل." }),
    null
  );
  assert.equal(full.input?.contactEmail, "ops@gulflp.com");
  assert.equal(full.input?.contactPhone, "+966 55 123 4567");
  assert.equal(full.input?.briefAr, "شريك طويل الأجل.");

  const bad = validateInvestor(form({ ...base, contactEmail: "not-an-email", contactPhone: "call me", briefEn: "x".repeat(2001) }), null);
  assert.equal(bad.input, null);
  assert.ok(bad.errors.contactEmail);
  assert.ok(bad.errors.contactPhone);
  assert.ok(bad.errors.briefEn);
});
