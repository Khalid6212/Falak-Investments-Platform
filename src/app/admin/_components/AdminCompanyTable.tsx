"use client";

import Link from "next/link";
import { ChevronRight, ChevronLeft } from "lucide-react";
import { Table, THead, TBody, Tr, Th, Td } from "@/components/ui/Table";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Num } from "@/components/ui/Num";
import { Button } from "@/components/ui/Button";
import { RefreshingForm } from "@/components/forms/RefreshingForm";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { formatCurrency, formatDate } from "@/lib/format";
import { archiveCompanyAction } from "../actions";
import type { AdminCompanyDTO, AdminVehicleDTO, AdminOwnershipLinkDTO } from "@/lib/admin/dto";
import { useListView, byText, byValue } from "@/components/lists/useListView";

// Reused by both /admin (Archive action) and /review (Review-selection action) --
// never both at once, since archiving a company mid-review and selecting
// it for review are different contexts.
interface AdminCompanyTableProps {
  companies: AdminCompanyDTO[];
  period: string;
  vehicles: AdminVehicleDTO[];
  vehicleLinks: AdminOwnershipLinkDTO[];
  // Adds a per-row "Review" action and omits the Archive column -- used by
  // /review's queue table. When omitted (the /admin default), the table
  // keeps its normal Archive action instead.
  onSelectForReview?: (company: AdminCompanyDTO) => void;
}

export function AdminCompanyTable({ companies, period, vehicles, vehicleLinks, onSelectForReview }: AdminCompanyTableProps) {
  const { t, lang } = useLanguage();
  const ChevronIcon = lang === "ar" ? ChevronLeft : ChevronRight;
  const columnCount = 10;
  const name = (c: AdminCompanyDTO) => (lang === "ar" ? c.nameAr : c.nameEn);
  const { visible, controls } = useListView(companies, {
    id: "admin-company-table",
    search: false,
    searchText: () => "",
    sorts: [
      byValue("recent", t.lists.recentlyUpdated, (c) => c.updatedAt, true),
      byText("nameAsc", t.lists.nameAsc, name),
      byText("nameDesc", t.lists.nameDesc, name, true),
      byValue("lastUpdated", t.lists.lastUpdatedDesc, (c) => c.periods[period]?.lastUpdated, true),
      byText("statusAsc", t.lists.statusAsc, (c) => c.periods[period]?.status),
      byValue("revenueDesc", t.lists.revenueDesc, (c) => c.periods[period]?.revenue, true),
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
            <Th>{t.admin.table.customerModelColumn}</Th>
            <Th>{t.admin.table.currentStageColumn}</Th>
            <Th>{t.admin.table.vehicleColumn}</Th>
            <Th>{t.admin.table.revenueColumn}</Th>
            <Th>{t.admin.table.statusColumn}</Th>
            <Th>{t.admin.table.lastUpdatedColumn}</Th>
            <Th>
              <span className="sr-only">{t.admin.table.viewCompanyAction}</span>
            </Th>
            <Th>
              <span className="sr-only">{onSelectForReview ? t.reviewWorkspace.reviewAction : t.admin.manage.archiveAction}</span>
            </Th>
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
            visible.map((company) => {
              const periodData = company.periods[period];
              const companyVehicles = vehicleLinks
                .filter((l) => l.companyId === company.id)
                .map((l) => vehicles.find((v) => v.id === l.vehicleId))
                .filter((v): v is NonNullable<typeof v> => Boolean(v));

              return (
                <Tr key={company.id} className="hover:bg-surface-muted/60">
                  <Td className="font-medium">{lang === "ar" ? company.nameAr : company.nameEn}</Td>
                  <Td>{lang === "ar" ? company.sectorAr : company.sectorEn}</Td>
                  <Td>{t.customerModels[company.customerModel]}</Td>
                  <Td>{t.stages[company.currentStage]}</Td>
                  <Td>
                    <div className="flex flex-wrap items-center gap-1">
                      {companyVehicles.length === 0 ? (
                        <span>—</span>
                      ) : (
                        companyVehicles.map((v, i) => (
                          <span key={v.id} className="inline-flex items-center gap-1">
                            <Link
                              href={`/vehicle/${v.slug}`}
                              className="chamfer-br-sm text-link-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-link-foreground"
                            >
                              {lang === "ar" ? v.nameAr : v.nameEn}
                            </Link>
                            {i < companyVehicles.length - 1 ? (
                              <span aria-hidden="true" className="text-muted-foreground">
                                {lang === "ar" ? "،" : ","}
                              </span>
                            ) : null}
                          </span>
                        ))
                      )}
                    </div>
                  </Td>
                  <Td>
                    {periodData?.revenue == null ? (
                      <span className="text-muted-foreground">{t.admin.table.noDataValue}</span>
                    ) : (
                      <Num>{formatCurrency(periodData.revenue, company.currency, lang)}</Num>
                    )}
                  </Td>
                  <Td>{periodData ? <StatusBadge status={periodData.status} /> : null}</Td>
                  <Td>
                    {periodData?.lastUpdated ? (
                      <time dateTime={periodData.lastUpdated}>{formatDate(periodData.lastUpdated, lang)}</time>
                    ) : (
                      <span className="text-muted-foreground">{t.admin.reportingStatusPanel.neverSubmitted}</span>
                    )}
                  </Td>
                  <Td>
                    <Link
                      href={`/company/${company.slug}?period=${encodeURIComponent(period)}${onSelectForReview ? "" : "&from=companies"}`}
                      className="chamfer-br-sm inline-flex items-center gap-1 text-sm font-medium text-link-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-link-foreground"
                    >
                      {t.admin.table.viewCompanyAction}
                      <ChevronIcon aria-hidden="true" className="h-4 w-4" />
                    </Link>
                  </Td>
                  <Td>
                    {onSelectForReview ? (
                      <Button
                        variant="outline"
                        size="xs"
                        onClick={() => onSelectForReview(company)}
                        aria-label={`${t.reviewWorkspace.reviewAction} — ${lang === "ar" ? company.nameAr : company.nameEn}`}
                      >
                        {t.reviewWorkspace.reviewAction}
                      </Button>
                    ) : company.archivedAt ? null : (
                      <RefreshingForm action={archiveCompanyAction}>
                        <input type="hidden" name="companyId" value={company.id} />
                        <Button type="submit" variant="outline" size="xs">
                          {t.admin.manage.archiveAction}
                        </Button>
                      </RefreshingForm>
                    )}
                  </Td>
                </Tr>
              );
            })
          )}
        </TBody>
      </Table>
    </div>
  );
}
