import { test } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";

// Imports the REAL production module via tests/support/mock-loader.mjs.
const { buildCompanyImportTemplate, parseCompanyImport } = await import("../src/lib/admin/company-import.ts");

const NONE = { names: new Set<string>(), slugs: new Set<string>() };

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
  return out instanceof ArrayBuffer ? out : (out as Uint8Array).buffer.slice(0) as ArrayBuffer;
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

test("company import: bad values, duplicates and taken web addresses are reported per row", async () => {
  const file = await filledTemplate([
    { ...VALID, "Name (English)": "Alpha", "Entry stage": "Series Z" },
    { ...VALID, "Name (English)": "Existing Co" },
    { ...VALID, "Name (English)": "Beta" },
    { ...VALID, "Name (English)": "Beta" },
    { ...VALID, "Name (English)": "Gamma", "Name (Arabic)": "" },
  ]);
  const { rows } = await parseCompanyImport(file, null, { names: new Set(["existing co"]), slugs: new Set(["beta"]) });
  assert.match(rows[0].problems.join(" "), /Entry stage: "Series Z" isn't one of the listed options/);
  assert.deepEqual(rows[1].problems, ["Already on the platform."]);
  assert.deepEqual(rows[2].problems, [], "a taken auto web address gets a suffix");
  assert.equal(rows[2].input!.slug, "beta-2");
  assert.deepEqual(rows[3].problems, ["Appears more than once in this file."]);
  assert.match(rows[4].problems.join(" "), /Name \(Arabic\)/);
  assert.equal(rows.filter((r) => r.input).length, 1);
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
  const { error, rows } = await parseCompanyImport((out as Uint8Array).buffer.slice(0) as ArrayBuffer, null, NONE);
  assert.match(error ?? "", /header row is missing/);
  assert.equal(rows.length, 0);
});

test("company import: the link-name column forgives websites, capitals and spaces instead of failing the row", async () => {
  const { linkNameFrom } = await import("../src/lib/admin/company-import.ts");
  assert.equal(linkNameFrom("https://www.LeadFlow.io/about", "LeadFlow"), "leadflow");
  assert.equal(linkNameFrom("thakaamed.ai", "Thakaamed"), "thakaamed");
  assert.equal(linkNameFrom("Handl Hub", "Handl Hub"), "handl-hub");
  assert.equal(linkNameFrom("", "Ajeer Pay"), "ajeer-pay");
  assert.equal(linkNameFrom("ــ", "Syntera AI"), "syntera-ai", "unusable text falls back to the name");

  const file = await filledTemplate([
    { ...VALID, "Name (English)": "LeadFlow", "Platform link name (optional)": "https://www.leadflow.io" },
    { ...VALID, "Name (English)": "Handl Hub", "Platform link name (optional)": "Handl Hub" },
    { ...VALID, "Name (English)": "QURK", "Platform link name (optional)": "leadflow" },
  ]);
  const { rows } = await parseCompanyImport(file, null, NONE);
  assert.deepEqual(rows.map((r) => r.problems), [[], [], []]);
  assert.deepEqual(rows.map((r) => r.input!.slug), ["leadflow", "handl-hub", "leadflow-2"]);
});

test("company import: a file made from the earlier template (old column header) still works", async () => {
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(await buildCompanyImportTemplate());
  const sheet = book.getWorksheet("Startups")!;
  const col: Record<string, number> = {};
  sheet.getRow(1).eachCell((cell, c) => (col[cell.text.replace(" *", "")] = c));
  sheet.getCell(1, col["Platform link name (optional)"]).value = "Web address (optional)";
  for (const [header, value] of Object.entries({ ...VALID, "Name (English)": "EyeGo" })) sheet.getCell(2, col[header]).value = value;
  sheet.getCell(2, col["Platform link name (optional)"]).value = "www.eyego.com";
  const out = await book.xlsx.writeBuffer();
  const { rows } = await parseCompanyImport((out as Uint8Array).buffer.slice(0) as ArrayBuffer, null, NONE);
  assert.deepEqual(rows[0].problems, []);
  assert.equal(rows[0].input!.slug, "eyego");
});
