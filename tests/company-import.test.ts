import { test } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";

// Imports the REAL production module via tests/support/mock-loader.mjs.
const { buildCompanyImportTemplate, parseCompanyImport } = await import("../src/lib/admin/company-import.ts");

const NONE = { companies: [], slugs: new Set<string>() };

// A startup already on the platform, with no website or founder details yet.
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
} as const;
const withExisting = () => ({ companies: [{ ...EXISTING, revenueModels: [...EXISTING.revenueModels] }], slugs: new Set(["existing-co"]) });

/** Fills the real template's Startups sheet, keyed by header text (without the "*"). */
async function filledTemplate(rows: Record<string, string>[]): Promise<ArrayBuffer> {
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(await buildCompanyImportTemplate());
  const sheet = book.getWorksheet("Startups")!;
  const col: Record<string, number> = {};
  sheet.getRow(1).eachCell((cell, c) => (col[cell.text.replace(" *", "")] = c));
  rows.forEach((row, i) => {
    for (const [header, value] of Object.entries(row)) {
      assert.ok(col[header], `template has a "${header}" column`);
      sheet.getCell(i + 2, col[header]).value = value;
    }
  });
  const out = await book.xlsx.writeBuffer();
  return out instanceof ArrayBuffer ? out : new Uint8Array(out as Uint8Array).buffer as ArrayBuffer;
}

const VALID = {
  "Name (English)": "Thakaa Med",
  "Name (Arabic)": "ذكاء ميد",
  Industry: "Healthtech",
  "Customer model": "Business-to-Business (B2B)",
  Currency: "US Dollar (USD)",
  "Entry stage": "Pre-Seed",
  "Current stage": "Seed",
  Department: "Investment Department",
};

test("company import: template rows with labels become valid startups; slug from the name", async () => {
  const file = await filledTemplate([
    { ...VALID, "Revenue models": "SaaS, Subscription", "Founder email": "Founder@Thakaa.com", "HQ country": "Saudi Arabia" },
  ]);
  const { error, rows } = await parseCompanyImport(file, null, NONE);
  assert.equal(error, null);
  assert.deepEqual(rows[0].problems, []);
  const input = rows[0].input!;
  assert.equal(input.slug, "thakaa-med");
  assert.equal(input.sectorEn, "Healthtech");
  assert.equal(input.customerModel, "B2B");
  assert.equal(input.currency, "USD");
  assert.equal(input.entryStage, "PreSeed");
  assert.equal(input.department, "InvestmentDepartment");
  assert.deepEqual(input.revenueModels, ["SaaS", "Subscription"]);
  assert.equal(input.founderEmail, "founder@thakaa.com");
  assert.equal(input.hqCountry, "SA");
});

test("company import: Arabic labels and internal codes are accepted too", async () => {
  const file = await filledTemplate([{ ...VALID, "Entry stage": "SeriesA", Department: "بناء المشاريع", Currency: "sar" }]);
  const { rows } = await parseCompanyImport(file, null, NONE);
  assert.deepEqual(rows[0].problems, []);
  assert.equal(rows[0].input!.entryStage, "SeriesA");
  assert.equal(rows[0].input!.currency, "SAR");
});

test("company import: bad values, repeats and taken link names are reported per row", async () => {
  const file = await filledTemplate([
    { ...VALID, "Name (English)": "Alpha", "Entry stage": "Series Z" },
    { ...VALID, "Name (English)": "Beta" },
    { ...VALID, "Name (English)": "Beta" },
    { ...VALID, "Name (English)": "Gamma", "Name (Arabic)": "" },
  ]);
  const { rows } = await parseCompanyImport(file, null, { companies: [], slugs: new Set(["beta"]) });
  assert.match(rows[0].problems.join(" "), /Entry stage: "Series Z" isn't one of the listed options/);
  assert.deepEqual(rows[1].problems, [], "a taken auto link name gets a suffix");
  assert.equal(rows[1].input!.slug, "beta-2");
  assert.deepEqual(rows[2].problems, ["Appears more than once in this file."]);
  assert.match(rows[3].problems.join(" "), /Name \(Arabic\)/);
  assert.equal(rows.filter((r) => r.input).length, 1);
});

test("import update: a startup already on the platform gets its empty fields filled, not rejected as a duplicate", async () => {
  // Same data as on the platform, plus a website and founder email that are empty there.
  const file = await filledTemplate([
    { "Name (English)": "existing co", "Name (Arabic)": "الشركة الحالية", Industry: "Healthtech", Website: "www.existing.co", "Founder email": "Founder@Existing.co" },
  ]);
  const { rows } = await parseCompanyImport(file, null, withExisting());
  const row = rows[0];
  assert.deepEqual(row.problems, []);
  assert.equal(row.kind, "update");
  assert.equal(row.companyId, "co_1");
  assert.deepEqual(row.changes.map((c) => c.field), ["nameEn"], "only the differently-typed name needs confirming");
  assert.deepEqual(row.fills.map((f) => [f.field, f.to]), [
    ["founderEmail", "founder@existing.co"],
    ["website", "https://www.existing.co"],
  ]);
  assert.equal(row.values.website, "https://www.existing.co");
});

test("import update: a different value for a filled field is a change to confirm, shown as current -> new", async () => {
  const file = await filledTemplate([{ "Name (English)": "Existing Co", "Current stage": "Series A", "HQ city": "Jeddah" }]);
  const { rows } = await parseCompanyImport(file, null, withExisting());
  assert.equal(rows[0].kind, "update");
  assert.deepEqual(rows[0].fills, []);
  assert.deepEqual(
    rows[0].changes.map((c) => [c.label, c.from, c.to]),
    [
      ["Current stage", "Seed", "Series A"],
      ["HQ city", "Riyadh", "Jeddah"],
    ]
  );
});

test("import update: empty cells never erase saved values; an identical row is reported as up to date", async () => {
  // Only the name: every other cell is empty, yet nothing is cleared.
  const file = await filledTemplate([{ "Name (English)": "Existing Co" }]);
  const { rows } = await parseCompanyImport(file, null, withExisting());
  assert.deepEqual(rows[0].problems, []);
  assert.equal(rows[0].kind, "unchanged");
  assert.deepEqual(rows[0].fills, []);
  assert.deepEqual(rows[0].changes, []);
});

test("import update: staff can't update a startup in another department through a file", async () => {
  const file = await filledTemplate([{ "Name (English)": "Existing Co", Website: "www.existing.co" }]);
  const { rows } = await parseCompanyImport(file, ["VentureBuilder"], withExisting());
  assert.match(rows[0].problems.join(" "), /another department/);
});

test("company import: staff limited to one department may leave Department empty; others may not use it", async () => {
  const file = await filledTemplate([
    { ...VALID, "Name (English)": "One", Department: "" },
    { ...VALID, "Name (English)": "Two", Department: "Venture Builder" },
  ]);
  const { rows } = await parseCompanyImport(file, ["InvestmentDepartment"], NONE);
  assert.equal(rows[0].input?.department, "InvestmentDepartment");
  assert.equal(rows[1].input, null, "outside their department");
});

test("company import: a file without the template's headers is refused as a whole", async () => {
  const book = new ExcelJS.Workbook();
  book.addWorksheet("Sheet1").addRow(["Company", "Sector"]);
  const out = await book.xlsx.writeBuffer();
  const { error, rows } = await parseCompanyImport(new Uint8Array(out as Uint8Array).buffer as ArrayBuffer, null, NONE);
  assert.match(error ?? "", /header row is missing/);
  assert.equal(rows.length, 0);
});

test("company import: names are saved exactly as typed and the website as a working link", async () => {
  const file = await filledTemplate([
    { ...VALID, "Name (English)": "LeadFlow", Website: "https://www.leadflow.io" },
    { ...VALID, "Name (English)": "Handl Hub", Website: "handlhub.com" },
    { ...VALID, "Name (English)": "QURK", Website: "N/A" },
    { ...VALID, "Name (English)": "ALFIA" },
  ]);
  const { rows } = await parseCompanyImport(file, null, NONE);
  assert.deepEqual(rows.map((r) => r.problems), [[], [], [], []]);
  assert.deepEqual(rows.map((r) => r.input!.nameEn), ["LeadFlow", "Handl Hub", "QURK", "ALFIA"]);
  assert.deepEqual(rows.map((r) => r.input!.website), ["https://www.leadflow.io", "https://handlhub.com", null, null]);
  // The platform link is built from the name; it never changes the name.
  assert.deepEqual(rows.map((r) => r.input!.slug), ["leadflow", "handl-hub", "qurk", "alfia"]);
});

test("company import: something that isn't a website is reported on its row", async () => {
  const file = await filledTemplate([{ ...VALID, Website: "not a website" }]);
  const { rows } = await parseCompanyImport(file, null, NONE);
  assert.match(rows[0].problems.join(" "), /Website: Enter a website/);
  assert.equal(rows[0].input, null);
});

test("company import: a file from the first template, with websites under \"Web address (optional)\", imports them as websites", async () => {
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(await buildCompanyImportTemplate());
  const sheet = book.getWorksheet("Startups")!;
  const col: Record<string, number> = {};
  sheet.getRow(1).eachCell((cell, c) => (col[cell.text.replace(" *", "")] = c));
  sheet.getCell(1, col["Website"]).value = "Web address (optional)";
  for (const [header, value] of Object.entries({ ...VALID, "Name (English)": "EyeGo" })) sheet.getCell(2, col[header]).value = value;
  sheet.getCell(2, col["Website"]).value = "www.eyego.com";
  const out = await book.xlsx.writeBuffer();
  const { rows } = await parseCompanyImport(new Uint8Array(out as Uint8Array).buffer as ArrayBuffer, null, NONE);
  assert.deepEqual(rows[0].problems, []);
  assert.equal(rows[0].input!.nameEn, "EyeGo");
  assert.equal(rows[0].input!.website, "https://www.eyego.com");
  assert.equal(rows[0].input!.slug, "eyego");
});
