"use client";

import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Select } from "@/components/ui/Select";
import { CompanyKpis } from "./CompanyKpis";
import { MetricsBreakdown } from "./MetricsBreakdown";
import { CompanyMetricsTrendChart } from "./CompanyMetricsTrendChart";
import { QuarterlyRevenueChart } from "./QuarterlyRevenueChart";
import { ValuationHistoryChart } from "./ValuationHistoryChart";
import { CashRunwayChart } from "@/components/charts/CashRunwayChart";
import { cashAndRunway } from "@/lib/reporting/cash-runway";
import { computeAnnualRevenue, quarterOf } from "@/lib/reporting/annual-revenue";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import type { CompanyReportData } from "@/lib/company/dto";

const linkButton =
  "chamfer-br-sm inline-flex w-fit items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-link-foreground shadow-[inset_0_0_0_1px_var(--control-border)] hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-link-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-surface";

interface CompanyDashboardProps {
  data: CompanyReportData;
  selectedPeriodKey: string;
  onPeriodChange: (key: string) => void;
}

/**
 * One startup's dashboard for a chosen reporting period: KPIs, revenue,
 * cash & runway and trend charts, every reported metric, valuation history
 * (Falak staff only) and the period's published commentary. Shared by the
 * startup report page and the startup profile.
 */
export function CompanyDashboard({ data, selectedPeriodKey, onPeriodChange }: CompanyDashboardProps) {
  const { company, periods, viewerRole } = data;
  const { t } = useLanguage();

  const periodData = company.periods[selectedPeriodKey];
  const selectedIndex = periods.findIndex((p) => p.key === selectedPeriodKey);
  const previousPeriodOption = selectedIndex > 0 ? periods[selectedIndex - 1] : null;
  const previousRevenue = previousPeriodOption ? company.periods[previousPeriodOption.key].revenue : null;

  // Falak-staff-only (confirmed with the project owner) -- investors and
  // company members never see valuation, so both the KPI card and the
  // evolution chart are gated on this, not just fetched-or-not.
  const isFalakStaff = viewerRole === "FALAK_STAFF";
  const latestValuation = isFalakStaff && data.valuations.length > 0 ? data.valuations[data.valuations.length - 1] : null;

  if (!periodData) {
    return <p className="text-sm text-muted-foreground">{t.companyReport.noReportingHistory}</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex w-full flex-col gap-1 sm:w-auto">
          <label htmlFor="report-period" className="text-xs font-medium text-muted-foreground">
            {t.admin.filters.periodLabel}
          </label>
          <Select id="report-period" className="sm:w-auto" value={selectedPeriodKey} onChange={(e) => onPeriodChange(e.target.value)}>
            {periods.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </Select>
        </div>
        <StatusBadge status={periodData.status} />
        {viewerRole === "COMPANY_MEMBER" ? (
          // Label says "Open" rather than "Edit" because some statuses
          // (submitted/under_review/approved/published) open the form
          // in a locked, read-only state -- see StartupReportForm.
          <Link href={`/submit/${company.slug}?period=${selectedPeriodKey}`} className={`${linkButton} sm:ms-auto`}>
            {t.submitReport.openFormLinkLabel}
          </Link>
        ) : null}
      </div>

      <CompanyKpis
        currency={company.currency}
        currentRevenue={periodData.revenue}
        previousRevenue={previousRevenue}
        previousPeriodLabel={previousPeriodOption?.label ?? null}
        latestValuation={latestValuation}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <QuarterlyRevenueChart
          currency={company.currency}
          summary={computeAnnualRevenue(
            periods.map((p) => ({ label: p.label, periodStart: p.periodStart, revenue: company.periods[p.key]?.revenue ?? null })),
            quarterOf(periods[selectedIndex].label, periods[selectedIndex].periodStart).year
          )}
        />
        <CashRunwayChart
          currency={company.currency}
          points={periods.map((p) => {
            const pd = company.periods[p.key];
            return { label: p.label, ...(pd ? cashAndRunway(pd.metrics, pd.revenue) : { cash: null, runway: null }) };
          })}
        />
        {periods.length > 1 ? (
          <CompanyMetricsTrendChart title={t.companyReport.trendTitle} periods={periods} periodsData={company.periods} currency={company.currency} />
        ) : null}
        {isFalakStaff && data.valuations.length > 0 ? (
          <ValuationHistoryChart title={t.companyReport.valuationHistoryTitle} valuations={data.valuations} currency={company.currency} />
        ) : null}
      </div>

      <MetricsBreakdown
        metrics={periodData.metrics}
        currency={company.currency}
        revenue={periodData.revenue}
        previousRevenue={previousRevenue}
        benchmarks={periodData.benchmarks}
      />

      {isFalakStaff && periodData.narratives.length > 0 ? (
        <Link href={`/company/${company.slug}/report?period=${selectedPeriodKey}`} className={linkButton}>
          {t.quarterlyReport.viewFormattedReportLabel}
        </Link>
      ) : null}

      {periodData.narratives.length > 0 ? (
        <Card className="min-w-0">
          <h2 className="font-heading text-sm font-semibold text-foreground">{t.companyReport.narrativeTitle}</h2>
          <div className="mt-3 space-y-4">
            {periodData.narratives.map((n) => (
              <div key={n.kind}>
                <h3 className="text-sm font-semibold text-foreground">{t.reviewWorkspace.narrativeKinds[n.kind]}</h3>
                <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">{t.reviewWorkspace.narrativeEnLabel}</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{n.textEn}</p>
                  </div>
                  <div dir="rtl">
                    <p className="text-xs font-medium text-muted-foreground">{t.reviewWorkspace.narrativeArLabel}</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{n.textAr}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
