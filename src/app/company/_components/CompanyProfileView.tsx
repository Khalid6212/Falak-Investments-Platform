"use client";

import { useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/Card";
import { KpiCard } from "@/components/ui/KpiCard";
import { Num } from "@/components/ui/Num";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { SegmentedToggle } from "@/components/ui/SegmentedToggle";
import { Table, THead, TBody, Tr, Th, Td } from "@/components/ui/Table";
import { useListView, byText, byValue } from "@/components/lists/useListView";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { formatCurrency, formatDate, formatPercent } from "@/lib/format";
import { CompanyDashboard } from "./CompanyDashboard";
import { CompanyInfoCard } from "./CompanyInfoCard";
import type { CompanyReportData, CompanyReportPeriodOption } from "@/lib/company/dto";
import type { Currency } from "@/generated/prisma/client";

export type ProfileTab = "overview" | "reports" | "dashboard";

const SUBMITTED = new Set(["submitted", "under_review", "approved", "published"]);

const smallLink =
  "chamfer-br-sm inline-flex shrink-0 items-center whitespace-nowrap px-2 py-1 text-xs font-bold text-foreground shadow-[inset_0_0_0_2px_var(--brand-dark-nebula)] hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-link-foreground";

interface CompanyProfileViewProps {
  data: CompanyReportData;
  initialTab: ProfileTab;
  initialPeriodKey: string;
}

/**
 * A startup's profile: basic information and investments, every report
 * requested from it, and the same dashboard as its report page.
 */
export function CompanyProfileView({ data, initialTab, initialPeriodKey }: CompanyProfileViewProps) {
  const { company, periods, viewerRole, investments, linkedVehicles } = data;
  const { t, lang } = useLanguage();
  const p = t.companyProfile;
  const isStaff = viewerRole === "FALAK_STAFF";
  const [tab, setTab] = useState<ProfileTab>(initialTab);
  const [periodKey, setPeriodKey] = useState(initialPeriodKey);
  const name = lang === "ar" ? company.nameAr : company.nameEn;

  // ---- overview figures ----
  const submittedCount = periods.filter((o) => SUBMITTED.has(company.periods[o.key]?.status)).length;
  const latestWithRevenue = [...periods].reverse().find((o) => company.periods[o.key]?.revenue != null);
  const investedByCurrency = new Map<Currency, number>();
  for (const i of investments) {
    if (i.investedAmount !== null && i.currency) investedByCurrency.set(i.currency, (investedByCurrency.get(i.currency) ?? 0) + i.investedAmount);
  }
  const latestValuation = isStaff && data.valuations.length > 0 ? data.valuations[data.valuations.length - 1] : null;

  // ---- reports list ----
  const order = (o: CompanyReportPeriodOption) => o.periodStart;
  const reports = useListView(periods, {
    id: "profile-reports",
    searchText: (o) => {
      const pd = company.periods[o.key];
      return `${o.label} ${pd?.templateNameEn ?? ""} ${pd?.templateNameAr ?? ""} ${pd?.status ?? ""}`;
    },
    sorts: [
      byValue("periodDesc", t.lists.periodDesc, order, true),
      byValue("periodAsc", t.lists.periodAsc, order),
      byText("statusAsc", t.lists.statusAsc, (o) => company.periods[o.key]?.status),
      byValue("lastUpdated", t.lists.lastUpdatedDesc, (o) => company.periods[o.key]?.lastUpdated, true),
    ],
  });

  const openDashboard = (key: string) => {
    setPeriodKey(key);
    setTab("dashboard");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <AppShell title={name} subtitle={p.subtitle}>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SegmentedToggle
            value={tab}
            onChange={setTab}
            ariaLabel={p.subtitle}
            options={[
              { value: "overview", label: p.tabOverview },
              { value: "reports", label: p.tabReports },
              { value: "dashboard", label: p.tabDashboard },
            ]}
          />
          {isStaff ? (
            <Link href={`/admin/manage/edit-company/${company.id}`} className={smallLink}>
              {p.editDetailsAction}
            </Link>
          ) : null}
        </div>
        {company.archivedAt ? <p className="text-sm font-medium text-danger">{p.archivedNote}</p> : null}

        {tab === "overview" ? (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <KpiCard label={t.admin.table.currentStageColumn} value={t.stages[company.currentStage]} hint={lang === "ar" ? company.sectorAr : company.sectorEn} />
              <KpiCard
                label={p.statReports}
                value={<Num>{p.statReportsValue.replace("{submitted}", String(submittedCount)).replace("{total}", String(periods.length))}</Num>}
              />
              <KpiCard
                label={p.statLatestRevenue}
                value={
                  latestWithRevenue ? (
                    <Num>{formatCurrency(company.periods[latestWithRevenue.key].revenue!, company.currency, lang)}</Num>
                  ) : (
                    t.admin.table.noDataValue
                  )
                }
                hint={latestWithRevenue?.label}
              />
              {isStaff ? (
                <KpiCard
                  label={latestValuation ? p.statLatestValuation : p.statTotalInvested}
                  value={
                    latestValuation ? (
                      <Num>{formatCurrency(latestValuation.amount, company.currency, lang)}</Num>
                    ) : investedByCurrency.size > 0 ? (
                      <Num>{[...investedByCurrency].map(([c, v]) => formatCurrency(v, c, lang)).join(" · ")}</Num>
                    ) : (
                      t.admin.table.noDataValue
                    )
                  }
                  hint={latestValuation ? formatDate(latestValuation.asOfDate, lang) : undefined}
                />
              ) : null}
            </div>

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <CompanyInfoCard company={company} showDepartment={isStaff} />

              <Card className="min-w-0">
                <h2 className="font-heading text-sm font-semibold text-foreground">{isStaff ? p.investmentsTitle : t.companyReport.linkedVehiclesTitle}</h2>
                {isStaff ? (
                  investments.length === 0 ? (
                    <p className="mt-3 text-sm text-muted-foreground">{p.noInvestments}</p>
                  ) : (
                    <table className="mt-3 w-full text-start text-sm">
                      <thead>
                        <tr className="border-b border-border-subtle text-xs text-muted-foreground">
                          <th className="py-1.5 pe-3 text-start font-medium">{t.admin.table.vehicleColumn}</th>
                          <th className="py-1.5 pe-3 text-start font-medium">{p.signedColumn}</th>
                          <th className="py-1.5 pe-3 text-start font-medium">{p.amountColumn}</th>
                          <th className="py-1.5 text-start font-medium">{p.ownershipColumn}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {investments.map((i, n) => (
                          <tr key={`${i.vehicleId}-${n}`} className="border-b border-border-subtle last:border-0">
                            <td className="py-1.5 pe-3">
                              <Link href={`/vehicle/${i.vehicleSlug}`} className="text-link-foreground underline-offset-2 hover:underline">
                                {lang === "ar" ? i.vehicleNameAr : i.vehicleNameEn}
                              </Link>
                            </td>
                            <td className="whitespace-nowrap py-1.5 pe-3">{formatDate(i.signedDate, lang)}</td>
                            <td className="whitespace-nowrap py-1.5 pe-3">
                              {i.investedAmount !== null && i.currency ? <Num>{formatCurrency(i.investedAmount, i.currency, lang)}</Num> : "—"}
                            </td>
                            <td className="whitespace-nowrap py-1.5">{i.ownershipPct !== null ? <Num>{formatPercent(i.ownershipPct, lang, 2)}</Num> : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )
                ) : linkedVehicles.length === 0 ? (
                  <p className="mt-3 text-sm text-muted-foreground">{t.companyReport.noVehiclesLinked}</p>
                ) : (
                  <ul className="mt-3 space-y-2 text-sm">
                    {linkedVehicles.map((v) => (
                      <li key={v.id} className="flex justify-between gap-3">
                        <span className="text-foreground">{lang === "ar" ? v.nameAr : v.nameEn}</span>
                        <span className="text-xs text-muted-foreground">{t.vehicleTypes[v.type]}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          </div>
        ) : null}

        {tab === "reports" ? (
          periods.length === 0 ? (
            <p className="text-sm text-muted-foreground">{p.noReports}</p>
          ) : (
            <div className="flex flex-col gap-2">
              {reports.controls}
              {reports.empty}
              <Table caption={p.reportsTitle}>
                <THead>
                  <Tr>
                    <Th>{t.companyRegister.periodColumnLabel}</Th>
                    <Th>{p.templateColumn}</Th>
                    <Th>{t.admin.table.statusColumn}</Th>
                    <Th>{t.admin.table.revenueColumn}</Th>
                    <Th>{t.admin.table.lastUpdatedColumn}</Th>
                    <Th>{t.admin.reportingStatusPanel.deadlineColumn}</Th>
                    <Th>
                      <span className="sr-only">{p.viewOnDashboardAction}</span>
                    </Th>
                  </Tr>
                </THead>
                <TBody>
                  {reports.visible.map((o) => {
                    const pd = company.periods[o.key];
                    return (
                      <Tr key={o.key}>
                        <Td className="whitespace-nowrap font-medium">{o.label}</Td>
                        <Td>{lang === "ar" ? pd.templateNameAr : pd.templateNameEn}</Td>
                        <Td>
                          <StatusBadge status={pd.status} />
                        </Td>
                        <Td className="whitespace-nowrap">
                          {pd.revenue === null ? t.admin.table.noDataValue : <Num>{formatCurrency(pd.revenue, company.currency, lang)}</Num>}
                        </Td>
                        <Td className="whitespace-nowrap">{pd.lastUpdated ? formatDate(pd.lastUpdated, lang) : t.admin.reportingStatusPanel.neverSubmitted}</Td>
                        <Td className="whitespace-nowrap">{formatDate(pd.currentDeadline, lang)}</Td>
                        <Td>
                          <div className="flex flex-col items-stretch gap-1">
                            <button type="button" className={smallLink} onClick={() => openDashboard(o.key)}>
                              {p.viewOnDashboardAction}
                            </button>
                            {pd.isPublished ? (
                              <Link href={`/company/${company.slug}/report?period=${encodeURIComponent(o.key)}`} className={smallLink}>
                                {p.formattedReportAction}
                              </Link>
                            ) : null}
                            {isStaff ? (
                              <Link href={`/admin/manage/reporting-requests/entry/${pd.cycleId}`} className={smallLink}>
                                {pd.status === "approved"
                                  ? t.admin.manage.viewDataAction
                                  : pd.metrics.some((m) => m.value !== null || m.isNa)
                                    ? t.admin.manage.editDataAction
                                    : t.admin.manage.enterDataAction}
                              </Link>
                            ) : null}
                          </div>
                        </Td>
                      </Tr>
                    );
                  })}
                </TBody>
              </Table>
            </div>
          )
        ) : null}

        {tab === "dashboard" ? <CompanyDashboard data={data} selectedPeriodKey={periodKey} onPeriodChange={setPeriodKey} /> : null}
      </div>
    </AppShell>
  );
}
