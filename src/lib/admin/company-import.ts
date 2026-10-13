import "server-only";
import ExcelJS from "exceljs";
import type { Department } from "@/generated/prisma/client";
import { en, ar } from "@/lib/i18n/dictionary";
import { INDUSTRIES } from "@/lib/industries";
import { COUNTRY_CODES, countryName } from "@/lib/countries";
import { slugify } from "@/lib/slugify";
import { validateCompany, type CompanyInput } from "@/lib/admin/entity-validation";

// Bulk-adding startups from an Excel sheet. Every row goes through the very
// same validateCompany() as the manual form, so an imported startup can
// never hold a value the form would refuse. Choice columns accept the
// English label, the Arabic label or the internal code, ignoring case,
// spacing and punctuation.

export const MAX_IMPORT_ROWS = 300;
const TEMPLATE_ROWS = 300;
const SHEET_NAME = "Startups";

interface Option {
  value: string;
  labels: string[];
}

const opts = (record: Record<string, string>, arRecord: Record<string, string>): Option[] =>
  Object.entries(record).map(([value, label]) => ({ value, labels: [value, label, arRecord[value] ?? ""] }));

const OPTIONS = {
  industry: INDUSTRIES.map((i) => ({ value: i.key, labels: [i.key, i.en, i.ar] })),
  customerModel: opts(en.customerModels, ar.customerModels),
  revenueModel: opts(en.revenueModels, ar.revenueModels),
  currency: opts(en.currencyNames, ar.currencyNames),
  stage: opts(en.stages, ar.stages),
  department: opts(en.departments, ar.departments),
  country: COUNTRY_CODES.map((code) => ({ value: code, labels: [code, countryName(code, "en"), countryName(code, "ar")] })),
};

type ListKey = Exclude<keyof typeof OPTIONS, "revenueModel">;

interface Column {
  /** Form field it fills. */
  field: string;
  header: string;
  required: boolean;
  /** Dropdown of allowed values in the template. */
  list?: ListKey;
  width: number;
  note?: string;
  /** Earlier header texts still recognised in uploaded files. */
  aliases?: string[];
}

const COLUMNS: Column[] = [
  { field: "nameEn", header: "Name (English)", required: true, width: 28 },
  { field: "nameAr", header: "Name (Arabic)", required: true, width: 28 },
  { field: "industry", header: "Industry", required: true, list: "industry", width: 32 },
  { field: "sectorEn", header: "Other industry (English)", required: false, width: 26, note: "Only when Industry is Other." },
  { field: "sectorAr", header: "Other industry (Arabic)", required: false, width: 26, note: "Only when Industry is Other." },
  { field: "customerModel", header: "Customer model", required: true, list: "customerModel", width: 34 },
  { field: "revenueModels", header: "Revenue models", required: false, width: 30, note: "Comma-separated, e.g. SaaS, Subscription." },
  { field: "currency", header: "Currency", required: true, list: "currency", width: 20 },
  { field: "entryStage", header: "Entry stage", required: true, list: "stage", width: 20 },
  { field: "currentStage", header: "Current stage", required: true, list: "stage", width: 20 },
  { field: "department", header: "Department", required: true, list: "department", width: 24 },
  { field: "founderName", header: "Founder name", required: false, width: 24 },
  { field: "founderEmail", header: "Founder email", required: false, width: 30 },
  { field: "founderPhone", header: "Founder phone", required: false, width: 20 },
  { field: "hqCity", header: "HQ city", required: false, width: 18 },
  { field: "hqCountry", header: "HQ country", required: false, list: "country", width: 24 },
  // "Web address (optional)" was this column's header in the first template
  // (meant as the platform link name, but read -- and filled in -- as the
  // startup's website), so files made from it are taken as websites.
  { field: "website", header: "Website", required: false, width: 30, note: "The startup's own website, e.g. www.company.com.", aliases: ["Web address (optional)", "Website (optional)"] },
];

const normalize = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

function match(raw: string, options: Option[]): string | null {
  const n = normalize(raw);
  if (!n) return null;
  return options.find((o) => o.labels.some((l) => l && normalize(l) === n))?.value ?? null;
}

/**
 * The startup's link name (slug) from whatever was typed in that column:
 * a website becomes its site name ("https://www.leadflow.io" -> "leadflow"),
 * anything else is tidied into lowercase-with-hyphens, and an empty or
 * unusable value falls back to the English name. Never an error by itself.
 */
export function linkNameFrom(raw: string, nameEn: string): string {
  const value = raw.trim();
  let candidate = "";
  if (value) {
    const looksLikeSite = /^(https?:\/\/|www\.)/i.test(value) || (/\./.test(value) && !/\s/.test(value));
    if (looksLikeSite) {
      const host = value.replace(/^https?:\/\//i, "").replace(/^www\./i, "").split(/[/?#:]/)[0];
      candidate = slugify(host.split(".")[0] ?? "");
    } else {
      candidate = slugify(value);
    }
  }
  return (candidate || slugify(nameEn)).slice(0, 74).replace(/-+$/, "");
}

/** The import template: a sheet to fill in, with dropdowns, plus instructions. */
export async function buildCompanyImportTemplate(): Promise<Buffer> {
  const book = new ExcelJS.Workbook();
  book.creator = "Falak Portfolio Platform";

  const sheet = book.addWorksheet(SHEET_NAME, { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = COLUMNS.map((c) => ({ header: c.required ? `${c.header} *` : c.header, key: c.field, width: c.width }));
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0E3B43" } };
  COLUMNS.forEach((c, i) => {
    if (c.note) header.getCell(i + 1).note = c.note;
  });

  // Allowed values live on their own sheet; each choice column's cells
  // get a dropdown pointing at its list.
  const lists = book.addWorksheet("Lists");
  const listKeys = Object.keys(OPTIONS).filter((k) => k !== "revenueModel") as ListKey[];
  const listHeaders: Record<ListKey, string> = {
    industry: "Industry",
    customerModel: "Customer model",
    currency: "Currency",
    stage: "Stage",
    department: "Department",
    country: "Country",
  };
  const listRange: Partial<Record<ListKey, string>> = {};
  listKeys.forEach((key, i) => {
    const col = lists.getColumn(i + 1);
    col.width = 34;
    const values = OPTIONS[key].map((o) => o.labels[1] || o.value);
    lists.getCell(1, i + 1).value = listHeaders[key];
    lists.getCell(1, i + 1).font = { bold: true };
    values.forEach((v, r) => (lists.getCell(r + 2, i + 1).value = v));
    listRange[key] = `Lists!$${col.letter}$2:$${col.letter}$${values.length + 1}`;
  });
  COLUMNS.forEach((c, i) => {
    if (!c.list) return;
    for (let r = 2; r <= TEMPLATE_ROWS + 1; r++) {
      sheet.getCell(r, i + 1).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: [listRange[c.list]!],
        showErrorMessage: false,
      };
    }
  });

  const help = book.addWorksheet("Instructions");
  help.getColumn(1).width = 110;
  [
    "How to import startups",
    "",
    `1. Fill in one startup per row on the "${SHEET_NAME}" sheet, starting on row 2. Columns marked * are required.`,
    "2. Use the dropdowns for Industry, Customer model, Currency, stages, Department and HQ country (English or Arabic labels both work).",
    '3. Industry "Other": also fill in both "Other industry" columns.',
    "   Names are saved exactly as you type them.",
    "4. Revenue models: any of SaaS, Marketplace, E-Commerce, Transaction-Based, Subscription, Other, separated by commas.",
    `5. Up to ${MAX_IMPORT_ROWS} startups per file. Don't rename the "${SHEET_NAME}" sheet or its header row.`,
    "6. Upload the file, click Check file, review any problems, then click Import. Only rows without problems are imported.",
    "Startups whose English name is already on the platform are skipped, so importing the same file twice adds nothing twice.",
  ].forEach((line, i) => {
    help.getCell(i + 1, 1).value = line;
    if (i === 0) help.getCell(i + 1, 1).font = { bold: true, size: 14 };
  });

  return Buffer.from(await book.xlsx.writeBuffer());
}

export interface ImportRow {
  rowNumber: number;
  nameEn: string;
  problems: string[];
  /** Set when the row can be created. */
  input: CompanyInput | null;
}

export interface ParsedImport {
  error: string | null;
  rows: ImportRow[];
}

const FIELD_HEADER = Object.fromEntries(COLUMNS.map((c) => [c.field, c.header]));

/**
 * Reads and validates an uploaded import file. Rows are checked against
 * each other and against `existing` (live startups' English names and
 * every slug in use, lower-cased) so nothing is created twice.
 */
export async function parseCompanyImport(
  file: ArrayBuffer,
  scope: Department[] | null,
  existing: { names: Set<string>; slugs: Set<string> }
): Promise<ParsedImport> {
  const book = new ExcelJS.Workbook();
  try {
    await book.xlsx.load(file);
  } catch {
    return { error: "That file couldn't be read. Upload the .xlsx template filled in.", rows: [] };
  }
  const sheet = book.getWorksheet(SHEET_NAME) ?? book.worksheets[0];
  if (!sheet) return { error: "The file has no sheets.", rows: [] };

  // Columns are found by their header text, so reordering them is fine.
  const columnOf: Record<string, number> = {};
  sheet.getRow(1).eachCell((cell, col) => {
    const text = normalize(cell.text.replace(/\*/g, ""));
    const column = COLUMNS.find((c) => [c.header, ...(c.aliases ?? [])].some((h) => normalize(h) === text));
    if (column) columnOf[column.field] = col;
  });
  const missing = COLUMNS.filter((c) => c.required && !columnOf[c.field]).map((c) => c.header);
  if (missing.length) {
    return { error: `The header row is missing: ${missing.join(", ")}. Start from the template.`, rows: [] };
  }

  const dataRows: { rowNumber: number; get: (field: string) => string }[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const get = (field: string) => (columnOf[field] ? row.getCell(columnOf[field]).text.trim() : "");
    if (COLUMNS.every((c) => !get(c.field))) return;
    dataRows.push({ rowNumber, get });
  });
  if (dataRows.length === 0) return { error: "No startups found. Fill in rows from row 2 down.", rows: [] };
  if (dataRows.length > MAX_IMPORT_ROWS) {
    return { error: `The file has ${dataRows.length} startups; import up to ${MAX_IMPORT_ROWS} at a time.`, rows: [] };
  }

  const namesSeen = new Set(existing.names);
  const slugsTaken = new Set(existing.slugs);
  const singleDepartment = scope && scope.length === 1 ? scope[0] : null;

  const rows: ImportRow[] = dataRows.map(({ rowNumber, get }) => {
    const problems: string[] = [];
    const nameEn = get("nameEn");
    const fd = new FormData();
    const choice = (field: string, list: ListKey, fallback = "") => {
      const raw = get(field);
      const value = raw ? match(raw, OPTIONS[list]) : fallback;
      if (raw && !value) problems.push(`${FIELD_HEADER[field]}: "${raw}" isn't one of the listed options.`);
      fd.set(field, value ?? "");
    };

    fd.set("nameEn", nameEn);
    fd.set("nameAr", get("nameAr"));
    choice("industry", "industry");
    fd.set("sectorEn", get("sectorEn"));
    fd.set("sectorAr", get("sectorAr"));
    choice("customerModel", "customerModel");
    choice("currency", "currency");
    choice("entryStage", "stage");
    choice("currentStage", "stage");
    // Staff limited to one department may leave it empty.
    choice("department", "department", singleDepartment ?? "");
    choice("hqCountry", "country");
    for (const f of ["founderName", "founderEmail", "founderPhone", "hqCity"]) fd.set(f, get(f));
    // "-" or "N/A" in the Website column means there is none.
    const website = get("website");
    fd.set("website", /^(-+|n\/?a|none|nil)$/i.test(website) ? "" : website);
    for (const raw of get("revenueModels").split(/[,،;\n]/).map((s) => s.trim()).filter(Boolean)) {
      const value = match(raw, OPTIONS.revenueModel);
      if (value) fd.append("revenueModels", value);
      else problems.push(`Revenue models: "${raw}" isn't one of the listed options.`);
    }

    // The startup's link on the platform is built from its English name
    // (the name itself is stored exactly as typed), made unique (-2, -3,
    // ...) when taken.
    const base = linkNameFrom("", nameEn);
    let slug = base;
    for (let n = 2; slug && slugsTaken.has(slug); n++) slug = `${base}-${n}`;
    if (!slug) problems.push("Name (English): needs at least one English letter or digit.");
    fd.set("slug", slug);

    const { errors, input } = validateCompany(fd, scope);
    for (const [field, message] of Object.entries(errors)) {
      // Choice values that didn't match are already reported above.
      if (problems.some((p) => p.startsWith(`${FIELD_HEADER[field] ?? field}:`))) continue;
      problems.push(`${FIELD_HEADER[field] ?? (field === "industry" ? "Industry" : field)}: ${message}`);
    }

    const nameKey = nameEn.trim().toLowerCase();
    if (nameKey && namesSeen.has(nameKey)) {
      problems.push(existing.names.has(nameKey) ? "Already on the platform." : "Appears more than once in this file.");
    }
    if (nameKey) namesSeen.add(nameKey);

    const ok = problems.length === 0 && input !== null;
    if (ok) slugsTaken.add(slug);
    return { rowNumber, nameEn: nameEn || "—", problems, input: ok ? input : null };
  });

  return { error: null, rows };
}

