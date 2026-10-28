import { test } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";

const { buildReportImportTemplate, parseReportImport, periodDates } = await import("../src/lib/admin/report-import.ts");

const TEMPLATE = {
  id: "tpl_1",
  nameEn: "Quarterly",
  metrics: [
    { id: "m_rev", key: "revenue_b2b", labelEn: "Revenue B2B", dataType: "Currency" as const, required: true },
    { id: "m_cash", key: "fin_monthly_net_cash_flow", labelEn: "Net cash flow", dataType: "Currency" as const, required: true },
    { id: "m_pay", key: "health_overdue_payables", labelEn: "Overdue payables", dataType: "Boolean" as const, required: false },
  ],
};
const COMPANIES = [
  { id: "co_acme", nameEn: "Acme", nameAr: "أكمي" },
  { id: "co_beta", nameEn: "Beta", nameAr: "بيتا" },
  { id: "co_gamma", nameEn: "Gamma", nameAr: "جاما" },
];
const d = (s: string) => new Date(`${s}T00:00:00Z`);

/** Downloads the real template, fills rows in, and returns the file. */
async function filled(rows: (string | number | Date | null)[][]): Promise<ArrayBuffer> {
  const book = new ExcelJS.Workbook();
  await book.xlsx.load((await buildReportImportTemplate(TEMPLATE, COMPANIES.map((c) => c.nameEn))) as unknown as ArrayBuffer);
  const sheet = book.getWorksheet("Reports")!;
  rows.forEach((r, i) => r.forEach((v, j) => (sheet.getCell(i + 2, j + 1).value = v)));
  const buf = await book.xlsx.writeBuffer();
  return buf as ArrayBuffer;
}

test("periods: quarters, halves and years fill in their dates", () => {
  assert.deepEqual(periodDates("Q3 2025"), { start: d("2025-07-01"), end: d("2025-09-30") });
  assert.deepEqual(periodDates("2025 q4"), { start: d("2025-10-01"), end: d("2025-12-31") });
  assert.deepEqual(periodDates("Q1-2024"), { start: d("2024-01-01"), end: d("2024-03-31") });
  assert.deepEqual(periodDates("H2 2025"), { start: d("2025-07-01"), end: d("2025-12-31") });
  assert.deepEqual(periodDates("FY2024"), { start: d("2024-01-01"), end: d("2024-12-31") });
  assert.equal(periodDates("Sep 2025"), null);
});

test("report import: a filled-in template round-trips into ready reports", async () => {
  // Startup, Period, Period start, Period end, Deadline, Revenue, Net cash flow, Overdue payables
  const file = await filled([
    ["Acme", "Q3 2025", null, null, null, 250000, -40000, "No"],
    ["بيتا", "Custom", d("2025-02-01"), d("2025-04-30"), d("2025-05-31"), "1,200", "(3,000)", "N/A"],
  ]);
  const parsed = await parseReportImport(file, TEMPLATE, COMPANIES, []);
  assert.equal(parsed.error, undefined);
  assert.deepEqual(parsed.ignoredColumns, []);
  const [acme, beta] = parsed.rows;
  assert.deepEqual(acme.problems, []);
  assert.equal(acme.action, "new");
  assert.equal(acme.companyId, "co_acme");
  assert.deepEqual([acme.periodStart, acme.periodEnd, acme.deadline], [d("2025-07-01"), d("2025-09-30"), d("2025-09-30")]);
  assert.deepEqual(acme.values, [
    { metricDefinitionId: "m_rev", rawValue: "250000", isNa: false },
    { metricDefinitionId: "m_cash", rawValue: "-40000", isNa: false },
    { metricDefinitionId: "m_pay", rawValue: "No", isNa: false },
  ]);
  assert.deepEqual(beta.problems, []);
  assert.equal(beta.companyId, "co_beta", "Arabic name matches too");
  assert.deepEqual(beta.deadline, d("2025-05-31"));
  assert.deepEqual(beta.values.find((v) => v.metricDefinitionId === "m_pay"), { metricDefinitionId: "m_pay", rawValue: "", isNa: true });
});

test("report import: missing required figures are flagged but the row still imports", async () => {
  const parsed = await parseReportImport(await filled([["Acme", "Q2 2025", null, null, null, 100]]), TEMPLATE, COMPANIES, []);
  assert.equal(parsed.rows[0].action, "new");
  assert.deepEqual(parsed.rows[0].missingRequired, ["Net cash flow"]);
});

test("report import: problems keep a row out", async () => {
  const cycles = [
    { companyId: "co_beta", templateId: "tpl_1", templateNameEn: "Quarterly", periodStart: d("2025-07-01"), periodEnd: d("2025-09-30"), cycleId: "cy_b", submissionId: "s_b", status: "approved" as const },
    { companyId: "co_gamma", templateId: "tpl_other", templateNameEn: "Gamma custom", periodStart: d("2025-07-01"), periodEnd: d("2025-09-30"), cycleId: "cy_g", submissionId: "s_g", status: "submitted" as const },
  ];
  const parsed = await parseReportImport(
    await filled([
      ["Nope Ltd", "Q3 2025", null, null, null, 1],
      ["Acme", "Sep 2025", null, null, null, 1],
      ["Acme", "Q3 2025", null, null, null, "abc"],
      ["Beta", "Q3 2025", null, null, null, 1],
      ["Gamma", "Q3 2025", null, null, null, 1],
      ["Acme", "Q4 2025", null, null, null, null, null, null],
      ["Acme", "Q1 2025", null, null, null, 5],
      ["Acme", "Q1 2025", null, null, null, 6],
    ]),
    TEMPLATE,
    COMPANIES,
    cycles
  );
  const problem = (row: number) => parsed.rows.find((r) => r.rowNumber === row)!.problems.join(" | ");
  assert.match(problem(2), /isn't on the platform/);
  assert.match(problem(3), /start and end dates/);
  assert.match(problem(4), /Revenue B2B: "abc"/);
  assert.match(problem(5), /Already has a report for this period that is approved/);
  assert.match(problem(6), /under template "Gamma custom"/);
  assert.match(problem(7), /No figures/);
  assert.equal(problem(8), "");
  assert.match(problem(9), /earlier row/);
  assert.deepEqual(parsed.rows.filter((r) => r.action).map((r) => r.rowNumber), [8]);
});

test("report import: an unsent or returned report for the period is filled in instead", async () => {
  const cycles = [{ companyId: "co_acme", templateId: "tpl_1", templateNameEn: "Quarterly", periodStart: d("2025-07-01"), periodEnd: d("2025-09-30"), cycleId: "cy_a", submissionId: "s_a", status: "changes_requested" as const }];
  const parsed = await parseReportImport(await filled([["Acme", "Q3 2025", null, null, null, 1, 2]]), TEMPLATE, COMPANIES, cycles);
  assert.equal(parsed.rows[0].action, "fill");
  assert.deepEqual(parsed.rows[0].existing, { cycleId: "cy_a", submissionId: "s_a", status: "changes_requested" });
});

test("report import: a file for another template is refused", async () => {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("Reports");
  sheet.addRow(["Startup (English name)", "Period", "Something else"]);
  sheet.addRow(["Acme", "Q3 2025", 5]);
  const parsed = await parseReportImport((await book.xlsx.writeBuffer()) as ArrayBuffer, TEMPLATE, COMPANIES, []);
  assert.match(parsed.error ?? "", /None of the columns match/);
});

test("report import action: Check writes nothing; Import creates the cycle and a submitted report with its figures", async () => {
  const { setCurrentUser, setDbStub, makeAdminActionDbStub, REAL_USER } = await import("./support/stubs.ts");
  const { importReportsAction } = await import("../src/app/admin/manage/new-reporting-cycle/report-import-actions.ts");
  setCurrentUser(REAL_USER);
  const created: Record<string, unknown>[] = [];
  const submissions: Record<string, unknown>[] = [];
  const statusUpdates: Record<string, unknown>[] = [];
  const values: Record<string, unknown>[] = [];
  const events: Record<string, unknown>[] = [];
  const stub = makeAdminActionDbStub({
    falakRoles: [{ role: "FALAK_ADMIN" }],
    models: {
      reportingTemplate: { findUnique: async () => TEMPLATE },
      company: { findMany: async () => COMPANIES },
      reportingCycle: {
        findMany: async () => [],
        create: async ({ data }: { data: Record<string, unknown> }) => {
          created.push(data);
          return { id: `cy_${created.length}` };
        },
      },
      companySubmission: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          submissions.push(data);
          return { id: `sub_${submissions.length}` };
        },
        updateMany: async (args: Record<string, unknown>) => {
          statusUpdates.push(args);
          return { count: 1 };
        },
      },
      submissionMetricValue: {
        upsert: async ({ create }: { create: Record<string, unknown> }) => {
          values.push(create);
          return create;
        },
      },
      submissionWorkflowEvent: {
        count: async () => 0,
        create: async ({ data }: { data: Record<string, unknown> }) => {
          events.push(data);
          return data;
        },
      },
    },
  });
  setDbStub(stub);
  const bytes = await filled([["Acme", "Q3 2025", null, null, null, 250000, -40000, "No"], ["Nope", "Q3 2025", null, null, null, 1]]);
  const form = (mode: string) => {
    const fd = new FormData();
    fd.set("mode", mode);
    fd.set("templateId", "tpl_1");
    fd.set("file", new File([bytes], "past.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    return fd;
  };

  const preview = await importReportsAction({ error: null }, form("preview"));
  assert.equal(preview.readyCount, 1);
  assert.equal(created.length + submissions.length + values.length, 0, "Check writes nothing");

  const result = await importReportsAction({ error: null }, form("import"));
  assert.equal(result.importedCount, 1);
  assert.equal(created.length, 1);
  assert.equal(created[0].companyId, "co_acme");
  assert.equal(created[0].remindersEnabled, undefined, "reminders stay off (the default)");
  assert.deepEqual(values.map((v) => v.numericValue ?? v.textValue), ["250000", "-40000", "No"]);
  assert.deepEqual((statusUpdates[0] as { data: unknown }).data, { status: "submitted", submittedById: REAL_USER.id });
  assert.equal(events[0].toStatus, "submitted");
  assert.match(String(events[0].comment), /Imported from Excel \(past\.xlsx\)/);
  assert.ok(stub.getAuditEvents().some((e) => e.action === "submission.imported"));
  assert.deepEqual(result.rows?.map((r) => r.outcome), ["imported", undefined]);
});

test("report import: a period overlapping an existing cycle on other dates is flagged, not duplicated", async () => {
  // e.g. Bookr's Q2 entered as 1 Mar - 30 Jun; importing "Q2 2026" (1 Apr - 30 Jun) must not add a second Q2.
  const cycles = [{ companyId: "co_acme", templateId: "tpl_1", templateNameEn: "Quarterly", periodStart: d("2026-03-01"), periodEnd: d("2026-06-30"), cycleId: "cy_q2", submissionId: "s_q2", status: "draft" as const }];
  const flagged = await parseReportImport(await filled([["Acme", "Q2 2026", null, null, null, 1, 2]]), TEMPLATE, COMPANIES, cycles);
  assert.match(flagged.rows[0].problems.join(" "), /Overlaps .* 2026-03-01 to 2026-06-30/);
  assert.equal(flagged.rows[0].action, null);
  // Using that cycle's own dates fills it in instead.
  const matched = await parseReportImport(await filled([["Acme", "Q2 2026", d("2026-03-01"), d("2026-06-30"), null, 1, 2]]), TEMPLATE, COMPANIES, cycles);
  assert.equal(matched.rows[0].action, "fill");
});

test("report import: a file that isn't Excel at all is refused with how to save it properly", async () => {
  const notExcel = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]); // a PNG image
  const parsed = await parseReportImport(notExcel.buffer as ArrayBuffer, TEMPLATE, COMPANIES, [], "report.xlsx");
  assert.match(parsed.error ?? "", /couldn.t be read as an Excel workbook/);
});

test("report import: each kind of unopenable file gets its own message; CSV works", async () => {
  // Office compound files (D0 CF 11 E0) named by their internal streams (UTF-16).
  const compound = (...streams: string[]) => {
    const parts = [Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(504), ...streams.map((s) => Buffer.from(s, "utf16le"))];
    const b = Buffer.concat(parts);
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  };
  const err = async (file: ArrayBuffer, name = "x.xlsx") => (await parseReportImport(file, TEMPLATE, COMPANIES, [], name)).error ?? "";
  assert.match(await err(compound("EncryptionInfo", "EncryptedPackage", "\u0006DataSpaces", "DRMEncryptedTransform")), /Sensitivity label/);
  assert.match(await err(compound("EncryptionInfo", "EncryptedPackage", "StrongEncryptionDataSpace")), /password-protected/);
  assert.match(await err(compound("Workbook", "SummaryInformation")), /97-2003/);

  // Excel's "CSV UTF-8" (with its byte-order mark) imports like the workbook.
  const csv = Buffer.from(
    "\uFEFFStartup (English name) *,Period *,Period start,Period end,Deadline,Revenue B2B [revenue_b2b] *,Net cash flow [fin_monthly_net_cash_flow] *\r\nAcme,Q3 2025,,,,250000,-40000\r\n",
    "utf8"
  );
  const parsed = await parseReportImport(csv.buffer.slice(csv.byteOffset, csv.byteOffset + csv.byteLength) as ArrayBuffer, TEMPLATE, COMPANIES, [], "past.csv");
  assert.equal(parsed.error, undefined);
  assert.equal(parsed.rows[0].action, "new");
  assert.deepEqual(parsed.rows[0].values.map((v) => v.rawValue), ["250000", "-40000"]);
});

test("report import: a file the full Excel reader trips over is read by its cell values", async () => {
  const JSZip = (await import("jszip")).default;
  const good = await filled([["Acme", "Custom", d("2025-02-01"), d("2025-04-30"), d("2025-05-31"), 250000, -40000, "No"]]);
  // Break a part the imports never need, as unusual workbooks do.
  const zip = await JSZip.loadAsync(good);
  zip.file("xl/theme/theme1.xml", "<a:theme <<< not xml");
  const sheetPath = Object.keys(zip.files).find((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))!;
  const sheetXml = await zip.file(sheetPath)!.async("string");
  zip.file(sheetPath, sheetXml.replace("</worksheet>", "<extLst><ext uri=\"x\"><bogus>").replace(/<bogus>$/, "<bogus></ext></extLst></worksheet>"));
  const styles = await zip.file("xl/styles.xml")!.async("string");
  zip.file("xl/styles.xml", styles.replace("</styleSheet>", "<dxfs count=\"1\"><dxf><font><b val=\"nonsense\"/></font></dxf></dxfs><broken></styleSheet>"));
  const broken = (await zip.generateAsync({ type: "uint8array" })).buffer as ArrayBuffer;

  const parsed = await parseReportImport(broken, TEMPLATE, COMPANIES, [], "Danah.xlsx");
  assert.equal(parsed.error, undefined);
  const [acme] = parsed.rows;
  assert.deepEqual(acme.problems, []);
  assert.deepEqual([acme.periodStart, acme.periodEnd, acme.deadline], [d("2025-02-01"), d("2025-04-30"), d("2025-05-31")]);
  assert.deepEqual(acme.values.map((v) => v.rawValue), ["250000", "-40000", "No"]);
});

test("report import: a web page saved as .xlsx is named as such", async () => {
  const page = new TextEncoder().encode("<html><body><table><tr><td>Acme</td></tr></table></body></html>").buffer as ArrayBuffer;
  const parsed = await parseReportImport(page, TEMPLATE, COMPANIES, [], "report.xlsx");
  assert.match(parsed.error ?? "", /web page/);
});

test("report import: a CSV with an .xlsx name is still read", async () => {
  const csv = '﻿Startup (English name),Period,Revenue B2B [revenue_b2b],Net cash flow [fin_monthly_net_cash_flow]\nAcme,Q3 2025,100,-5\n';
  const parsed = await parseReportImport(new TextEncoder().encode(csv).buffer as ArrayBuffer, TEMPLATE, COMPANIES, [], "report.xlsx");
  assert.equal(parsed.error, undefined);
  assert.deepEqual(parsed.rows[0].values.map((v) => v.rawValue), ["100", "-5"]);
});
