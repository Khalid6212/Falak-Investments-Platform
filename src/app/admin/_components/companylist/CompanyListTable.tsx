"use client";

import Link from "next/link";
import { Table, THead, TBody, Tr, Th, Td } from "@/components/ui/Table";
import { Num } from "@/components/ui/Num";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { formatCurrency, formatPercent, formatNumber, formatDate } from "@/lib/format";
import { convertToDisplay, type DisplayCurrency } from "@/lib/currency/convert";
import type { CompanyListRow } from "@/lib/admin/company-list";
import { useListView, byText, byValue } from "@/components/lists/useListView";

interface CompanyListTableProps {
  companies: CompanyListRow[];
  displayCurrency: DisplayCurrency;
}

const columnCount = 11;

// Links map to exactly the three page families the user asked for:
// the company name to its own profile page, each vehicle chip to that
// vehicle's page, and the Last Updated cell (the one figure that's
// literally "when this company's report was last touched") to its
// report page.
export function CompanyListTable({ companies, displayCurrency }: CompanyListTableProps) {
  const { t, lang } = useLanguage();
  const name = (c: CompanyListRow) => (lang === "ar" ? c.nameAr : c.nameEn);
  const { visible, controls } = useListView(companies, {
    id: "company-list",
    search: false,
    searchText: () => "",
    sorts: [
      byValue("recent", t.lists.recentlyUpdated, (c) => c.updatedAt, true),
      byText("nameAsc", t.lists.nameAsc, name),
      byText("nameDesc", t.lists.nameDesc, name, true),
      byValue("lastUpdated", t.lists.lastUpdatedDesc, (c) => c.lastUpdated, true),
      byValue("revenueDesc", t.lists.revenueDesc, (c) => (c.lastReportedRevenue === null ? null : convertToDisplay(c.lastReportedRevenue, c.currency, displayCurrency)), true),
      byValue("burnDesc", t.lists.burnDesc, (c) => (c.lastReportedCashBurn === null ? null : convertToDisplay(c.lastReportedCashBurn, c.currency, displayCurrency)), true),
      byValue("runwayAsc", t.lists.runwayAsc, (c) => c.lastReportedRunwayMonths),
      byValue("investmentYear", t.lists.investmentYearDesc, (c) => c.investmentYear, true),
      byText("sectorAsc", t.lists.sectorAsc, (c) => (lang === "ar" ? c.sectorAr : c.sectorEn)),
    ],
  });

  return (
    <div className="flex flex-col gap-2">
      {companies.length > 0 ? controls : null}
      <Table caption={t.admin.table.caption}>
        <THead>
          <Tr>
            <Th>{t.admin.table.companyColumn}</Th>
            <Th>{t.admin.table.sectorColumn}</Th>
            <Th>{t.admin.table.currentStageColumn}</Th>
            <Th>{t.admin.table.departmentColumn}</Th>
            <Th>{t.admin.table.vehicleColumn}</Th>
            <Th>{t.admin.table.investmentYearColumn}</Th>
            <Th>{t.admin.table.revenueColumn}</Th>
            <Th>{t.admin.table.grossMarginColumn}</Th>
            <Th>{t.admin.table.cashBurnColumn}</Th>
            <Th>{t.admin.charts.runwayColumn}</Th>
            <Th>{t.admin.table.lastUpdatedColumn}</Th>
          </Tr>
        </THead>
        <TBody>
          {companies.length === 0 ? (
            <Tr>
              <Td colSpan={columnCount} className="py-8 text-center text-muted-foreground">
                {t.admin.emptyState}
              </Td>
            </Tr>
          ) : (
            visible.map((company) => (
              <Tr key={company.id}>
                <Td>
                  <Link
                    href={`/company/${company.slug}/profile`}
                    className="font-medium text-link-foreground underline-offset-2 hover:underline"
                  >
                    {lang === "ar" ? company.nameAr : company.nameEn}
                  </Link>
                </Td>
                <Td>{lang === "ar" ? company.sectorAr : company.sectorEn}</Td>
                <Td>{t.stages[company.currentStage]}</Td>
                <Td>{t.departments[company.department]}</Td>
                <Td>
                  {company.vehicles.length === 0 ? (
                    <span className="text-muted-foreground">{t.admin.table.noVehicleValue}</span>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {company.vehicles.map((v) => (
                        <Link
                          key={v.id}
                          href={`/vehicle/${v.slug}`}
                          className="text-link-foreground underline-offset-2 hover:underline"
                        >
                          {lang === "ar" ? v.nameAr : v.nameEn}
                        </Link>
                      ))}
                    </div>
                  )}
                </Td>
                <Td>{company.investmentYear ?? <span className="text-muted-foreground">{t.admin.table.noDataValue}</span>}</Td>
                <Td>
                  {company.lastReportedRevenue === null ? (
                    <span className="text-muted-foreground">{t.admin.table.noDataValue}</span>
                  ) : (
                    <Num>{formatCurrency(convertToDisplay(company.lastReportedRevenue, company.currency, displayCurrency), displayCurrency, lang)}</Num>
                  )}
                </Td>
                <Td>
                  {company.lastReportedGrossMargin === null ? (
                    <span className="text-muted-foreground">{t.admin.table.noDataValue}</span>
                  ) : (
                    <Num>{formatPercent(company.lastReportedGrossMargin, lang)}</Num>
                  )}
                </Td>
                <Td>
                  {company.lastReportedCashBurn === null ? (
                    <span className="text-muted-foreground">{t.admin.table.noDataValue}</span>
                  ) : (
                    <Num>{formatCurrency(convertToDisplay(company.lastReportedCashBurn, company.currency, displayCurrency), displayCurrency, lang)}</Num>
                  )}
                </Td>
                <Td>
                  {company.lastReportedRunwayMonths === null ? (
                    <span className="text-muted-foreground">{t.admin.table.noDataValue}</span>
                  ) : (
                    <Num>{formatNumber(company.lastReportedRunwayMonths, lang)}</Num>
                  )}
                </Td>
                <Td>
                  {company.lastUpdated === null ? (
                    <span className="text-muted-foreground">{t.admin.table.noDataValue}</span>
                  ) : (
                    <Link
                      href={`/company/${company.slug}/report`}
                      className="text-link-foreground underline-offset-2 hover:underline"
                    >
                      {formatDate(company.lastUpdated, lang)}
                    </Link>
                  )}
                </Td>
              </Tr>
            ))
          )}
        </TBody>
      </Table>
    </div>
  );
}
