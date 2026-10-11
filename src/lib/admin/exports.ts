import "server-only";
import ExcelJS from "exceljs";
import { db } from "@/lib/db";
import { requireFalakRoleWithDepartmentScope } from "@/lib/auth/department-scope";
import { REVENUE_METRIC_KEYS, sumRevenueMetricValues } from "@/lib/reporting/revenue-metrics";
import { en } from "@/lib/i18n/dictionary";
import type { Currency, Department } from "@/generated/prisma/client";

// Excel exports for the Company List and Portfolio Dashboard. Same access
// as those pages: Admin/Management only, limited to the caller's
// department (Admin sees everything). Archived records are left out, as
// on screen. Amounts are never converted between currencies -- each
// amount sits next to its own currency column.

const INVESTED_STATUSES = ["Active", "Superseded"] as const;
const MONEY_FORMAT = "#,##0.00";
const PERCENT_FORMAT = "0.00%";

interface Column {
  header: string;
  key: string;
  width?: number;
  numFmt?: string;
}

function addSheet(book: ExcelJS.Workbook, name: string, columns: Column[], rows: Record<string, unknown>[]) {
  const sheet = book.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = columns.map((c) => ({
    header: c.header,
    key: c.key,
    width: c.width ?? Math.max(12, c.header.length + 2),
    style: c.numFmt ? { numFmt: c.numFmt } : undefined,
  }));
  rows.forEach((r) => sheet.addRow(r));
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF123338" } };
  header.alignment = { vertical: "middle", wrapText: true };
  header.height = 28;
  if (rows.length > 0) {
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  }
  return sheet;
}

const toDate = (d: Date | null | undefined) => (d ? new Date(d.toISOString().slice(0, 10)) : null);
const num = (d: { toNumber(): number } | null | undefined) => (d ? d.toNumber() : null);
const dept = (d: Department) => en.departments[d];

// The startups export matches the Company List (every staff role); the
// portfolio export stays Management/Admin, like the Portfolio Dashboard.
async function scope(role: "FALAK_OPERATIONS" | "FALAK_MANAGEMENT") {
  const { departments } = await requireFalakRoleWithDepartmentScope(role);
  return departments ? { department: { in: departments } } : {};
}

/** Per-currency totals as "Invested (SAR)" / "Invested (USD)" style columns. */
function byCurrency(amounts: { amount: number; currency: Currency }[]): Record<Currency, number | null> {
  const totals: Record<Currency, number | null> = { SAR: null, USD: null };
  for (const a of amounts) totals[a.currency] = (totals[a.currency] ?? 0) + a.amount;
  return totals;
}

async function companyRows(deptWhere: object) {
  const companies = await db.company.findMany({
    where: { archivedAt: null, ...deptWhere },
    orderBy: { nameEn: "asc" },
    include: {
      ownershipPositions: {
        include: {
          vehicle: { select: { nameEn: true, archivedAt: true } },
          investor: { select: { nameEn: true } },
          agreements: {
            where: { status: { in: [...INVESTED_STATUSES] } },
            select: { investedAmount: true, currency: true, signedDate: true },
          },
        },
      },
      valuations: { orderBy: { asOfDate: "desc" }, take: 1 },
      cycles: {
        orderBy: { periodStart: "desc" },
        select: {
          periodLabel: true,
          submission: {
            select: {
              status: true,
              metricValues: {
                where: { metricDefinition: { key: { in: REVENUE_METRIC_KEYS } } },
                select: { metricDefinition: { select: { key: true } }, numericValue: true, isNa: true },
              },
            },
          },
        },
      },
    },
  });

  return companies.map((c) => {
    const vehicles = [
      ...new Set(c.ownershipPositions.filter((p) => p.vehicle && !p.vehicle.archivedAt).map((p) => p.vehicle!.nameEn)),
    ];
    const direct = c.ownershipPositions.filter((p) => !p.vehicleId).map((p) => p.investor?.nameEn ?? "Falak (direct)");
    const agreements = c.ownershipPositions.flatMap((p) => p.agreements);
    const invested = byCurrency(
      agreements
        .filter((a) => a.investedAmount !== null && a.currency !== null)
        .map((a) => ({ amount: a.investedAmount!.toNumber(), currency: a.currency! }))
    );
    const firstSigned = agreements.map((a) => a.signedDate).sort((a, b) => a.getTime() - b.getTime())[0];
    const latestValuation = c.valuations[0];
    const reported = c.cycles.find((cy) => cy.submission && cy.submission.status !== "draft");

    return {
      nameEn: c.nameEn,
      nameAr: c.nameAr,
      slug: c.slug,
      industryEn: c.sectorEn,
      industryAr: c.sectorAr,
      department: dept(c.department),
      customerModel: en.customerModels[c.customerModel],
      revenueModels: c.revenueModels.map((m) => en.revenueModels[m]).join(", "),
      currency: c.currency,
      entryStage: en.stages[c.entryStage],
      currentStage: en.stages[c.currentStage],
      founderName: c.founderName,
      founderEmail: c.founderEmail,
      founderPhone: c.founderPhone,
      hqCity: c.hqCity,
      hqCountry: c.hqCountry ? new Intl.DisplayNames(["en"], { type: "region" }).of(c.hqCountry) : null,
      vehicles: [...vehicles, ...direct].join(", "),
      firstInvestment: toDate(firstSigned),
      investedSAR: invested.SAR,
      investedUSD: invested.USD,
      valuation: num(latestValuation?.valuationAmount),
      valuationCurrency: latestValuation?.currency ?? null,
      valuationType: latestValuation ? latestValuation.valuationType : null,
      valuationDate: toDate(latestValuation?.asOfDate),
      lastReportedPeriod: reported?.periodLabel ?? null,
      lastReportedRevenue: reported?.submission ? sumRevenueMetricValues(reported.submission.metricValues) : null,
    };
  });
}

const COMPANY_COLUMNS: Column[] = [
  { header: "Startup (English)", key: "nameEn", width: 26 },
  { header: "Startup (Arabic)", key: "nameAr", width: 22 },
  { header: "Slug", key: "slug", width: 18 },
  { header: "Industry (English)", key: "industryEn", width: 26 },
  { header: "Industry (Arabic)", key: "industryAr", width: 24 },
  { header: "Department", key: "department", width: 22 },
  { header: "Business Model", key: "customerModel", width: 30 },
  { header: "Revenue Models", key: "revenueModels", width: 26 },
  { header: "Reporting Currency", key: "currency" },
  { header: "Entry Stage", key: "entryStage", width: 18 },
  { header: "Current Stage", key: "currentStage", width: 18 },
  { header: "Founder Name", key: "founderName", width: 22 },
  { header: "Founder Email", key: "founderEmail", width: 28 },
  { header: "Founder Phone", key: "founderPhone", width: 18 },
  { header: "HQ City", key: "hqCity", width: 16 },
  { header: "HQ Country", key: "hqCountry", width: 18 },
  { header: "Held Through", key: "vehicles", width: 30 },
  { header: "First Investment", key: "firstInvestment", numFmt: "yyyy-mm-dd" },
  { header: "Invested (SAR)", key: "investedSAR", width: 16, numFmt: MONEY_FORMAT },
  { header: "Invested (USD)", key: "investedUSD", width: 16, numFmt: MONEY_FORMAT },
  { header: "Latest Valuation", key: "valuation", width: 18, numFmt: MONEY_FORMAT },
  { header: "Valuation Currency", key: "valuationCurrency" },
  { header: "Valuation Type", key: "valuationType", width: 16 },
  { header: "Valuation Date", key: "valuationDate", numFmt: "yyyy-mm-dd" },
  { header: "Last Reported Period", key: "lastReportedPeriod" },
  { header: "Last Reported Revenue", key: "lastReportedRevenue", width: 20, numFmt: MONEY_FORMAT },
];

function newBook(): ExcelJS.Workbook {
  const book = new ExcelJS.Workbook();
  book.creator = "Falak Portfolio Platform";
  book.created = new Date();
  return book;
}

export async function buildCompaniesWorkbook(): Promise<Buffer> {
  return writeCompaniesWorkbook(await scope("FALAK_OPERATIONS"));
}

/** Builds the file for an already-checked department filter ({} = all). */
export async function writeCompaniesWorkbook(deptWhere: object): Promise<Buffer> {
  const book = newBook();
  addSheet(book, "Startups", COMPANY_COLUMNS, await companyRows(deptWhere));
  return Buffer.from(await book.xlsx.writeBuffer());
}

export async function buildPortfolioWorkbook(): Promise<Buffer> {
  return writePortfolioWorkbook(await scope("FALAK_MANAGEMENT"));
}

/** Builds the file for an already-checked department filter ({} = all). */
export async function writePortfolioWorkbook(deptWhere: object): Promise<Buffer> {
  const book = newBook();

  const [companies, vehicles, agreements, companyValuations, navs, lpPositions] = await Promise.all([
    companyRows(deptWhere),
    db.vehicle.findMany({
      where: { archivedAt: null, ...deptWhere },
      orderBy: { nameEn: "asc" },
      include: {
        ownershipPositions: {
          where: { company: { archivedAt: null } },
          include: {
            agreements: {
              where: { status: { in: [...INVESTED_STATUSES] } },
              select: { investedAmount: true, currency: true },
            },
          },
        },
        navSnapshots: { orderBy: { asOfDate: "desc" }, take: 1 },
        positions: { where: { status: "Active" }, select: { investorId: true, commitmentAmount: true, calledAmount: true, currency: true } },
      },
    }),
    db.investmentAgreement.findMany({
      where: { ownershipPosition: { company: { archivedAt: null, ...deptWhere } } },
      orderBy: { signedDate: "asc" },
      include: {
        ownershipPosition: {
          include: {
            company: { select: { nameEn: true, entryStage: true, currentStage: true } },
            vehicle: { select: { nameEn: true } },
            investor: { select: { nameEn: true } },
          },
        },
      },
    }),
    db.companyValuationSnapshot.findMany({
      where: { company: { archivedAt: null, ...deptWhere } },
      orderBy: [{ company: { nameEn: "asc" } }, { asOfDate: "asc" }],
      include: { company: { select: { nameEn: true } } },
    }),
    db.vehicleNavSnapshot.findMany({
      where: { vehicle: { archivedAt: null, ...deptWhere } },
      orderBy: [{ vehicle: { nameEn: "asc" } }, { asOfDate: "asc" }],
      include: { vehicle: { select: { nameEn: true } } },
    }),
    db.investorVehiclePosition.findMany({
      where: { vehicle: { archivedAt: null, ...deptWhere }, investor: { archivedAt: null } },
      orderBy: [{ vehicle: { nameEn: "asc" } }, { effectiveFrom: "asc" }],
      include: { vehicle: { select: { nameEn: true } }, investor: { select: { nameEn: true, type: true } } },
    }),
  ]);

  const vehicleRows = vehicles.map((v) => {
    const invested = byCurrency(
      v.ownershipPositions
        .flatMap((p) => p.agreements)
        .filter((a) => a.investedAmount !== null && a.currency !== null)
        .map((a) => ({ amount: a.investedAmount!.toNumber(), currency: a.currency! }))
    );
    const committed = byCurrency(
      v.positions.filter((p) => p.commitmentAmount).map((p) => ({ amount: p.commitmentAmount!.toNumber(), currency: p.currency }))
    );
    const called = byCurrency(
      v.positions.filter((p) => p.calledAmount).map((p) => ({ amount: p.calledAmount!.toNumber(), currency: p.currency }))
    );
    const nav = v.navSnapshots[0];
    return {
      nameEn: v.nameEn,
      nameAr: v.nameAr,
      type: en.vehicleTypes[v.type],
      currency: v.currency,
      department: dept(v.department),
      vintageYear: v.vintageYear,
      startups: new Set(v.ownershipPositions.map((p) => p.companyId)).size,
      investors: new Set(v.positions.map((p) => p.investorId)).size,
      investedSAR: invested.SAR,
      investedUSD: invested.USD,
      committedSAR: committed.SAR,
      committedUSD: committed.USD,
      calledSAR: called.SAR,
      calledUSD: called.USD,
      nav: num(nav?.navAmount),
      navCurrency: nav?.currency ?? null,
      navDate: toDate(nav?.asOfDate),
    };
  });

  // Summary: counts plus per-currency totals (never blended).
  const sum = (rows: Record<string, unknown>[], key: string) =>
    rows.reduce((s, r) => s + (typeof r[key] === "number" ? (r[key] as number) : 0), 0);
  const latestValuationBy = (cur: Currency) =>
    companies.filter((c) => c.valuationCurrency === cur).reduce((s, c) => s + (c.valuation ?? 0), 0);
  const latestNavBy = (cur: Currency) => vehicleRows.filter((v) => v.navCurrency === cur).reduce((s, v) => s + (v.nav ?? 0), 0);
  const summary = [
    { item: "Startups", value: companies.length },
    { item: "Investment vehicles", value: vehicleRows.length },
    { item: "Invested capital (SAR)", value: sum(companies, "investedSAR"), money: true },
    { item: "Invested capital (USD)", value: sum(companies, "investedUSD"), money: true },
    { item: "Latest startup valuations (SAR)", value: latestValuationBy("SAR"), money: true },
    { item: "Latest startup valuations (USD)", value: latestValuationBy("USD"), money: true },
    { item: "Latest vehicle NAV (SAR)", value: latestNavBy("SAR"), money: true },
    { item: "Latest vehicle NAV (USD)", value: latestNavBy("USD"), money: true },
    { item: "Exported on", value: new Date(new Date().toISOString().slice(0, 10)) },
  ];
  const summarySheet = addSheet(
    book,
    "Summary",
    [
      { header: "Item", key: "item", width: 34 },
      { header: "Value", key: "value", width: 22 },
    ],
    summary.map(({ item, value }) => ({ item, value }))
  );
  summary.forEach((row, i) => {
    summarySheet.getCell(i + 2, 2).numFmt = row.money ? MONEY_FORMAT : row.value instanceof Date ? "yyyy-mm-dd" : "0";
  });

  addSheet(book, "Startups", COMPANY_COLUMNS, companies);

  addSheet(
    book,
    "Vehicles",
    [
      { header: "Vehicle (English)", key: "nameEn", width: 26 },
      { header: "Vehicle (Arabic)", key: "nameAr", width: 22 },
      { header: "Type", key: "type" },
      { header: "Currency", key: "currency" },
      { header: "Department", key: "department", width: 22 },
      { header: "Vintage Year", key: "vintageYear" },
      { header: "Startups", key: "startups" },
      { header: "Investors", key: "investors" },
      { header: "Invested (SAR)", key: "investedSAR", width: 16, numFmt: MONEY_FORMAT },
      { header: "Invested (USD)", key: "investedUSD", width: 16, numFmt: MONEY_FORMAT },
      { header: "Committed (SAR)", key: "committedSAR", width: 16, numFmt: MONEY_FORMAT },
      { header: "Committed (USD)", key: "committedUSD", width: 16, numFmt: MONEY_FORMAT },
      { header: "Called (SAR)", key: "calledSAR", width: 16, numFmt: MONEY_FORMAT },
      { header: "Called (USD)", key: "calledUSD", width: 16, numFmt: MONEY_FORMAT },
      { header: "Latest NAV", key: "nav", width: 16, numFmt: MONEY_FORMAT },
      { header: "NAV Currency", key: "navCurrency" },
      { header: "NAV Date", key: "navDate", numFmt: "yyyy-mm-dd" },
    ],
    vehicleRows
  );

  addSheet(
    book,
    "Investments",
    [
      { header: "Startup", key: "company", width: 26 },
      { header: "Held Through", key: "holder", width: 26 },
      { header: "Agreement No.", key: "agreementNumber", width: 18 },
      { header: "Round", key: "round", width: 16 },
      { header: "Status", key: "status" },
      { header: "Signed Date", key: "signedDate", numFmt: "yyyy-mm-dd" },
      { header: "Invested Amount", key: "amount", width: 18, numFmt: MONEY_FORMAT },
      { header: "Currency", key: "currency" },
      { header: "Ownership at Signing", key: "ownership", width: 20, numFmt: PERCENT_FORMAT },
      { header: "Entry Stage", key: "entryStage", width: 18 },
      { header: "Current Stage", key: "currentStage", width: 18 },
    ],
    agreements.map((a) => {
      const p = a.ownershipPosition;
      return {
        company: p.company.nameEn,
        holder: p.vehicle?.nameEn ?? p.investor?.nameEn ?? "Falak (direct)",
        agreementNumber: a.agreementNumber,
        round: a.roundLabel,
        status: a.status,
        signedDate: toDate(a.signedDate),
        amount: num(a.investedAmount),
        currency: a.currency,
        ownership: num(a.ownershipPct),
        entryStage: en.stages[p.company.entryStage],
        currentStage: en.stages[p.company.currentStage],
      };
    })
  );

  addSheet(
    book,
    "Startup Valuations",
    [
      { header: "Startup", key: "company", width: 26 },
      { header: "As Of", key: "asOf", numFmt: "yyyy-mm-dd" },
      { header: "Valuation", key: "amount", width: 18, numFmt: MONEY_FORMAT },
      { header: "Currency", key: "currency" },
      { header: "Type", key: "type", width: 16 },
      { header: "Source", key: "source", width: 28 },
    ],
    companyValuations.map((v) => ({
      company: v.company.nameEn,
      asOf: toDate(v.asOfDate),
      amount: num(v.valuationAmount),
      currency: v.currency,
      type: v.valuationType,
      source: v.source,
    }))
  );

  addSheet(
    book,
    "Vehicle NAV",
    [
      { header: "Vehicle", key: "vehicle", width: 26 },
      { header: "As Of", key: "asOf", numFmt: "yyyy-mm-dd" },
      { header: "NAV", key: "amount", width: 18, numFmt: MONEY_FORMAT },
      { header: "Currency", key: "currency" },
      { header: "Source", key: "source", width: 28 },
    ],
    navs.map((n) => ({ vehicle: n.vehicle.nameEn, asOf: toDate(n.asOfDate), amount: num(n.navAmount), currency: n.currency, source: n.source }))
  );

  addSheet(
    book,
    "Vehicle Investors",
    [
      { header: "Vehicle", key: "vehicle", width: 26 },
      { header: "Investor", key: "investor", width: 26 },
      { header: "Investor Type", key: "investorType", width: 16 },
      { header: "Status", key: "status" },
      { header: "Effective From", key: "from", numFmt: "yyyy-mm-dd" },
      { header: "Contribution", key: "commitment", width: 18, numFmt: MONEY_FORMAT },
      { header: "Called", key: "called", width: 16, numFmt: MONEY_FORMAT },
      { header: "Currency", key: "currency" },
      { header: "Ownership", key: "ownership", numFmt: PERCENT_FORMAT },
    ],
    lpPositions.map((p) => ({
      vehicle: p.vehicle.nameEn,
      investor: p.investor.nameEn,
      investorType: en.investorTypes[p.investor.type],
      status: p.status,
      from: toDate(p.effectiveFrom),
      commitment: num(p.commitmentAmount),
      called: num(p.calledAmount),
      currency: p.currency,
      ownership: num(p.ownershipPct),
    }))
  );

  return Buffer.from(await book.xlsx.writeBuffer());
}
