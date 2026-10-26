import "server-only";
import ExcelJS from "exceljs";
import type { MetricDataType, SubmissionStatus } from "@/generated/prisma/client";
import { invalidMetricFields, type MetricValueInput } from "@/lib/reporting/metrics";

// Backfilling reports from Excel: past quarters gathered before the
// platform, or reports collected by hand later. One file per reporting
// template; one row per startup per period; one column per metric. Each
// row becomes that startup's reporting cycle with a submitted report,
// which then goes through review like any other.

export const MAX_REPORT_IMPORT_ROWS = 300;
const SHEET_NAME = "Reports";
const TEMPLATE_ROWS = 100;

export interface ImportTemplateMetric {
  id: string;
  key: string;
  labelEn: string;
  dataType: MetricDataType;
  required: boolean;
}

export interface ImportTemplate {
  id: string;
  nameEn: string;
  metrics: ImportTemplateMetric[];
}

const FIXED = [
  { field: "startup", header: "Startup (English name)", required: true, width: 30, note: "Exactly as on the platform; pick from the dropdown." },
  { field: "period", header: "Period", required: true, width: 14, note: 'e.g. "Q3 2025". Quarters (Q1-Q4 YYYY), halves (H1/H2 YYYY) and years (FY2025) fill in their own dates.' },
  { field: "periodStart", header: "Period start", required: false, width: 14, note: "Date, e.g. 2025-07-01. Leave empty for Q/H/FY periods." },
  { field: "periodEnd", header: "Period end", required: false, width: 14, note: "Date, e.g. 2025-09-30. Leave empty for Q/H/FY periods." },
  { field: "deadline", header: "Deadline", required: false, width: 14, note: "Optional. Defaults to the period end." },
] as const;

const metricHeader = (m: ImportTemplateMetric) => `${m.labelEn} [${m.key}]${m.required ? " *" : ""}`;
const normalize = (s: string) => s.replace(/\*/g, "").replace(/\s+/g, " ").trim().toLowerCase();

const DATA_TYPE_HINT: Record<MetricDataType, string> = {
  Currency: "Amount in the startup's currency, e.g. 250000 or -40000.",
  Number: "A number, e.g. 1200 or -15.",
  Percent: "A percentage, e.g. 12.5 or -3.",
  Boolean: "Yes or No.",
  Text: "Text.",
};

/** The Excel sheet to fill in for one template, with the startups to choose from. */
export async function buildReportImportTemplate(template: ImportTemplate, startupNames: string[]): Promise<Buffer> {
  const book = new ExcelJS.Workbook();
  book.creator = "Falak Portfolio Platform";
  const sheet = book.addWorksheet(SHEET_NAME, { views: [{ state: "frozen", xSplit: 2, ySplit: 1 }] });
  sheet.columns = [
    ...FIXED.map((c) => ({ header: c.required ? `${c.header} *` : c.header, width: c.width })),
    ...template.metrics.map((m) => ({ header: metricHeader(m), width: Math.min(40, Math.max(16, m.labelEn.length + 4)) })),
  ];
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0E3B43" } };
  header.alignment = { wrapText: true, vertical: "middle" };
  header.height = 45;
  FIXED.forEach((c, i) => (header.getCell(i + 1).note = c.note));
  template.metrics.forEach((m, i) => (header.getCell(FIXED.length + i + 1).note = `${m.dataType}. ${DATA_TYPE_HINT[m.dataType]} "N/A" if it doesn't apply.`));

  const lists = book.addWorksheet("Lists");
  lists.getColumn(1).width = 40;
  lists.getCell(1, 1).value = "Startups";
  lists.getCell(1, 1).font = { bold: true };
  startupNames.forEach((n, r) => (lists.getCell(r + 2, 1).value = n));
  lists.getCell(1, 2).value = "Yes / No";
  lists.getCell(1, 2).font = { bold: true };
  ["Yes", "No", "N/A"].forEach((v, r) => (lists.getCell(r + 2, 2).value = v));
  for (let r = 2; r <= TEMPLATE_ROWS + 1; r++) {
    if (startupNames.length > 0) {
      sheet.getCell(r, 1).dataValidation = { type: "list", allowBlank: true, formulae: [`Lists!$A$2:$A$${startupNames.length + 1}`], showErrorMessage: false };
    }
    template.metrics.forEach((m, i) => {
      if (m.dataType === "Boolean") {
        sheet.getCell(r, FIXED.length + i + 1).dataValidation = { type: "list", allowBlank: true, formulae: ["Lists!$B$2:$B$4"], showErrorMessage: false };
      }
    });
  }

  const help = book.addWorksheet("Instructions");
  help.getColumn(1).width = 110;
  [
    `How to import past reports -- template "${template.nameEn}"`,
    "",
    `1. Fill in one row per startup per period on the "${SHEET_NAME}" sheet, from row 2. Columns marked * are required.`,
    '2. Period: e.g. "Q3 2025" (quarter), "H1 2025" (half year) or "FY2025" (year) -- their dates fill in automatically. Any other period needs its start and end dates.',
    "3. Figures: one column per metric (its key is in [brackets]). Numbers may include commas or a minus sign; write N/A where it doesn't apply; leave empty if unknown.",
    "4. Each row is added as a submitted report for review. Required fields left empty are flagged but still imported; the reviewer can fill them in.",
    "5. A startup that already has a submitted report for the same period is skipped. One with an unsent or returned report for that period has it filled in and submitted.",
    `6. Up to ${MAX_REPORT_IMPORT_ROWS} rows per file. Don't rename the "${SHEET_NAME}" sheet or its header row; columns can be in any order.`,
    "7. Upload the file, click Check file, review the rows, then click Import.",
  ].forEach((line, i) => {
    help.getCell(i + 1, 1).value = line;
    if (i === 0) help.getCell(i + 1, 1).font = { bold: true, size: 14 };
  });

  return Buffer.from(await book.xlsx.writeBuffer());
}

/** "Q3 2025", "2025 Q3", "Q3-2025", "H1 2025", "FY2025", "FY 2025" -> its dates (UTC). */
export function periodDates(label: string): { start: Date; end: Date } | null {
  const s = label.trim().toUpperCase().replace(/[\s\-_/]+/g, " ");
  const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));
  const quarter = s.match(/^Q([1-4]) ?(\d{4})$/) ?? s.match(/^(\d{4}) ?Q([1-4])$/);
  if (quarter) {
    const [q, y] = s.startsWith("Q") ? [Number(quarter[1]), Number(quarter[2])] : [Number(quarter[2]), Number(quarter[1])];
    return { start: utc(y, (q - 1) * 3, 1), end: utc(y, q * 3, 0) };
  }
  let m = s.match(/^H([12]) ?(\d{4})$/);
  if (m) {
    const [h, y] = [Number(m[1]), Number(m[2])];
    return { start: utc(y, (h - 1) * 6, 1), end: utc(y, h * 6, 0) };
  }
  m = s.match(/^(?:FY ?)?(\d{4})$/);
  if (m) {
    const y = Number(m[1]);
    return { start: utc(y, 0, 1), end: utc(y, 12, 0) };
  }
  return null;
}

function cellDate(cell: ExcelJS.Cell): Date | null | "invalid" {
  const v = cell.value;
  if (v === null || v === undefined || cell.text.trim() === "") return null;
  if (v instanceof Date) return new Date(Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate()));
  const text = cell.text.trim();
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
  const dmy = text.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/);
  if (dmy) return new Date(Date.UTC(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1])));
  return "invalid";
}

/** A figure cell as typed: numbers as plain digits (no Excel formatting), formulas by their result. */
function cellValue(cell: ExcelJS.Cell): string {
  const v = cell.value;
  if (typeof v === "number") return String(v);
  if (v && typeof v === "object" && "result" in v && typeof v.result === "number") return String(v.result);
  return cell.text.trim();
}

export interface ExistingCycleRef {
  companyId: string;
  templateId: string;
  templateNameEn: string;
  periodStart: Date;
  periodEnd: Date;
  cycleId: string;
  submissionId: string | null;
  status: SubmissionStatus | null;
}

export interface ParsedReportRow {
  rowNumber: number;
  startup: string;
  companyId: string | null;
  periodLabel: string;
  periodStart: Date | null;
  periodEnd: Date | null;
  deadline: Date | null;
  values: MetricValueInput[];
  answeredCount: number;
  missingRequired: string[];
  problems: string[];
  /** "new": a new cycle; "fill": an unsent/returned report for the period is filled in and submitted. */
  action: "new" | "fill" | null;
  existing: { cycleId: string; submissionId: string | null; status: SubmissionStatus | null } | null;
}

export interface ParsedReportImport {
  error?: string;
  rows: ParsedReportRow[];
  /** Header cells that matched no column and were ignored (e.g. a misspelt metric). */
  ignoredColumns?: string[];
}

const day = (d: Date) => d.toISOString().slice(0, 10);
const sameDay = (a: Date, b: Date) => day(a) === day(b);
const FILLABLE: (SubmissionStatus | null)[] = [null, "draft", "changes_requested"];
const STATUS_WORDS: Partial<Record<SubmissionStatus, string>> = {
  submitted: "submitted",
  under_review: "in review",
  approved: "approved",
};

/**
 * Reads a filled-in report import file against one template. `companies`
 * are the startups the caller may report for; `cycles` every existing
 * cycle of those startups (any template), to catch periods already
 * reported. Nothing is written here.
 */
export async function parseReportImport(
  file: ArrayBuffer,
  template: ImportTemplate,
  companies: { id: string; nameEn: string; nameAr: string }[],
  cycles: ExistingCycleRef[]
): Promise<ParsedReportImport> {
  const book = new ExcelJS.Workbook();
  try {
    await book.xlsx.load(file);
  } catch {
    return { error: "That file couldn't be read. Upload the .xlsx template filled in.", rows: [] };
  }
  const sheet = book.getWorksheet(SHEET_NAME) ?? book.worksheets[0];
  if (!sheet) return { error: "The file has no sheets.", rows: [] };

  // Columns are found by header text: fixed columns by name, metrics by
  // the [key] in their header or by their English label.
  const fixedCol: Record<string, number> = {};
  const metricCol = new Map<string, number>();
  const byKey = new Map(template.metrics.map((m) => [m.key.toLowerCase(), m] as const));
  const byLabel = new Map(template.metrics.map((m) => [normalize(m.labelEn), m] as const));
  const unknownHeaders: string[] = [];
  sheet.getRow(1).eachCell((cell, col) => {
    const raw = cell.text.trim();
    if (!raw) return;
    const text = normalize(raw);
    const fixed = FIXED.find((c) => normalize(c.header) === text);
    if (fixed) {
      fixedCol[fixed.field] = col;
      return;
    }
    const key = raw.match(/\[([^\]]+)\]/)?.[1]?.trim().toLowerCase();
    const metric = (key ? byKey.get(key) : undefined) ?? byLabel.get(text.replace(/\s*\[[^\]]*\]\s*/, ""));
    if (metric) metricCol.set(metric.id, col);
    else unknownHeaders.push(raw);
  });
  if (!fixedCol.startup || !fixedCol.period) {
    return { error: 'The header row needs "Startup (English name)" and "Period". Start from the downloaded template.', rows: [] };
  }
  if (metricCol.size === 0) {
    return { error: `None of the columns match the metrics of "${template.nameEn}". Download this template's file and fill it in.`, rows: [] };
  }

  const dataRows: ExcelJS.Row[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const anything = [fixedCol.startup, fixedCol.period, ...metricCol.values()].some((c) => row.getCell(c).text.trim() !== "");
    if (anything) dataRows.push(row);
  });
  if (dataRows.length === 0) return { error: "No reports found. Fill in rows from row 2 down.", rows: [] };
  if (dataRows.length > MAX_REPORT_IMPORT_ROWS) {
    return { error: `The file has ${dataRows.length} rows; import up to ${MAX_REPORT_IMPORT_ROWS} at a time.`, rows: [] };
  }

  const companyByName = new Map<string, (typeof companies)[number]>();
  for (const c of companies) {
    companyByName.set(normalize(c.nameEn), c);
    companyByName.set(normalize(c.nameAr), c);
  }
  const definitions = new Map(template.metrics.map((m) => [m.id, m.dataType] as const));
  const seen = new Set<string>();

  const rows = dataRows.map((row): ParsedReportRow => {
    const problems: string[] = [];
    const text = (field: string) => (fixedCol[field] ? row.getCell(fixedCol[field]).text.trim() : "");
    const date = (field: string, label: string) => {
      if (!fixedCol[field]) return null;
      const d = cellDate(row.getCell(fixedCol[field]));
      if (d === "invalid") {
        problems.push(`${label}: "${row.getCell(fixedCol[field]).text}" isn't a date (use 2025-07-01).`);
        return null;
      }
      return d;
    };

    const startup = text("startup");
    const company = startup ? (companyByName.get(normalize(startup)) ?? null) : null;
    if (!startup) problems.push("Startup is empty.");
    else if (!company) problems.push(`Startup "${startup}" isn't on the platform (or isn't in your department).`);

    const periodLabel = text("period");
    let periodStart = date("periodStart", "Period start");
    let periodEnd = date("periodEnd", "Period end");
    const derived = periodLabel ? periodDates(periodLabel) : null;
    periodStart ??= derived?.start ?? null;
    periodEnd ??= derived?.end ?? null;
    if (!periodLabel) problems.push("Period is empty.");
    else if (!periodStart || !periodEnd) problems.push(`Period "${periodLabel}": add its start and end dates (only Q1-Q4, H1/H2 and FY periods fill them in).`);
    else if (periodEnd < periodStart) problems.push("Period end is before its start.");
    const deadline = date("deadline", "Deadline") ?? periodEnd;

    const values: MetricValueInput[] = [];
    for (const m of template.metrics) {
      const col = metricCol.get(m.id);
      if (!col) continue;
      const raw = cellValue(row.getCell(col));
      if (!raw) continue;
      const isNa = /^n\/?a$/i.test(raw);
      values.push({ metricDefinitionId: m.id, rawValue: isNa ? "" : raw, isNa });
    }
    const invalid = invalidMetricFields(values, definitions);
    for (const [field, message] of Object.entries(invalid)) {
      const metric = template.metrics.find((m) => `value_${m.id}` === field);
      const raw = values.find((v) => `value_${v.metricDefinitionId}` === field)?.rawValue;
      problems.push(`${metric?.labelEn ?? field}: "${raw}" -- ${message}`);
    }
    const answered = new Set(values.map((v) => v.metricDefinitionId));
    const missingRequired = template.metrics.filter((m) => m.required && !answered.has(m.id)).map((m) => m.labelEn);
    if (values.length === 0) problems.push("No figures filled in.");

    let action: ParsedReportRow["action"] = null;
    let existing: ParsedReportRow["existing"] = null;
    if (company && periodStart && periodEnd && problems.length === 0) {
      const dupKey = `${company.id}|${periodStart.toISOString()}|${periodEnd.toISOString()}`;
      if (seen.has(dupKey)) problems.push("This startup and period are already on an earlier row of the file.");
      seen.add(dupKey);
      const samePeriod = cycles.filter((c) => c.companyId === company.id && sameDay(c.periodStart, periodStart!) && sameDay(c.periodEnd, periodEnd!));
      const mine = samePeriod.find((c) => c.templateId === template.id);
      const other = samePeriod.find((c) => c.templateId !== template.id);
      if (mine && !FILLABLE.includes(mine.status)) {
        problems.push(`Already has a report for this period that is ${STATUS_WORDS[mine.status!] ?? mine.status}; skipped.`);
      } else if (!mine && other) {
        problems.push(`Already has a report for this period under template "${other.templateNameEn}"; skipped.`);
      } else if (!mine) {
        // A cycle covering part of the same months under other dates (e.g. a
        // Q2 entered as 1 Mar - 30 Jun) would otherwise get a second report
        // for the same quarter.
        const overlap = cycles.find((c) => c.companyId === company.id && c.periodStart <= periodEnd! && c.periodEnd >= periodStart!);
        if (overlap) {
          problems.push(
            `Overlaps this startup's existing "${overlap.templateNameEn}" cycle for ${day(overlap.periodStart)} to ${day(overlap.periodEnd)}; skipped. Use the same dates as that cycle to fill it in, or correct its dates first.`
          );
        }
      }
      if (action === null && problems.length === 0) {
        action = mine ? "fill" : "new";
        existing = mine ? { cycleId: mine.cycleId, submissionId: mine.submissionId, status: mine.status } : null;
      }
    }

    return {
      rowNumber: row.number,
      startup,
      companyId: company?.id ?? null,
      periodLabel,
      periodStart,
      periodEnd,
      deadline,
      values,
      answeredCount: values.length,
      missingRequired,
      problems,
      action: problems.length === 0 ? action : null,
      existing,
    };
  });

  return { rows, ignoredColumns: unknownHeaders };
}
