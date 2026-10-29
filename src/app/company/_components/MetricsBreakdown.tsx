"use client";

import type { ReactNode } from "react";
import { Card } from "@/components/ui/Card";
import { Num } from "@/components/ui/Num";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { formatPercent } from "@/lib/format";
import { computeGrossMargin, computeNetMargin, percentChange } from "@/lib/reporting/computed-metrics";
import { findNumericMetricValue, formatMetricValue } from "@/lib/reporting/metric-format";
import type { Currency } from "@/generated/prisma/client";
import type { SubmissionMetricFieldDTO } from "@/lib/reporting/dto";
import type { CompanyMetricBenchmark } from "@/lib/admin/benchmarking";
import type { Dictionary } from "@/lib/i18n/dictionary";

// Same key-prefix convention as MetricsEntryForm (the submit-side
// counterpart) -- fin_/health_/cust_/qual_, plus the reused revenue_b2b.
// Kept as its own small copy rather than a shared helper: this is a
// read-only display grouping, the form's is an editable-field grouping,
// and the two have already started to diverge (this one also injects
// the computed-only margin/growth rows into the financial section).
function sectionFor(key: string): keyof Pick<Dictionary["submitReport"], "sectionFinancial" | "sectionHealth" | "sectionCustomer" | "sectionQualitative"> {
  if (key === "revenue_b2b" || key.startsWith("fin_")) return "sectionFinancial";
  if (key.startsWith("health_")) return "sectionHealth";
  if (key.startsWith("cust_")) return "sectionCustomer";
  return "sectionQualitative";
}

function groupMetrics(metrics: SubmissionMetricFieldDTO[]) {
  const groups: Record<string, SubmissionMetricFieldDTO[]> = {
    sectionFinancial: [],
    sectionHealth: [],
    sectionCustomer: [],
    sectionQualitative: [],
  };
  for (const m of [...metrics].sort((a, b) => a.sortOrder - b.sortOrder)) {
    groups[sectionFor(m.key)].push(m);
  }
  return groups;
}

interface MetricRowProps {
  label: string;
  value: ReactNode;
}

function MetricRow({ label, value }: MetricRowProps) {
  return (
    <div className="flex justify-between gap-3 border-b border-border-subtle py-1.5 text-sm last:border-0">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-end text-foreground">{value}</dd>
    </div>
  );
}

interface MetricsBreakdownProps {
  metrics: SubmissionMetricFieldDTO[];
  currency: Currency;
  // Already-computed Total Revenue (B2B + B2C) for this period and the
  // immediately preceding one -- the same values CompanyKpis is given,
  // so Revenue Growth here always matches the KPI card above it.
  revenue: number | null;
  previousRevenue: number | null;
  // Falak-staff-only -- always [] for a company member (see
  // CompanyReportPeriodData.benchmarks' own comment on why). Shown
  // inline next to the matching metric row, the same percentile figure
  // BenchmarksView shows in its portfolio-wide table, so a staff viewer
  // doesn't have to leave this page to see how this company compares to
  // its peers for the period they're already looking at.
  benchmarks: CompanyMetricBenchmark[];
}

export function MetricsBreakdown({ metrics, currency, revenue, previousRevenue, benchmarks }: MetricsBreakdownProps) {
  const { t, lang } = useLanguage();

  if (metrics.length === 0) {
    return null;
  }

  const groups = groupMetrics(metrics);
  const naDisplay = <span className="text-muted-foreground">{t.companyReport.naValueDisplay}</span>;

  function percentileHint(key: string) {
    const benchmark = benchmarks.find((b) => b.key === key);
    if (!benchmark || benchmark.percentile === null) return null;
    return (
      <span className="ms-1.5 text-xs text-muted-foreground">
        (<Num>{formatPercent(benchmark.percentile / 100, lang)}</Num> {t.admin.charts.percentileLabel})
      </span>
    );
  }

  function formatFieldValue(field: SubmissionMetricFieldDTO) {
    const formatted = formatMetricValue(field, currency, lang);
    if (formatted === null) return naDisplay;
    const hint = percentileHint(field.key);
    if (field.dataType === "Text" || field.dataType === "Boolean" || field.dataType === "Date") {
      return (
        <>
          <span className="whitespace-pre-wrap">{formatted}</span>
          {hint}
        </>
      );
    }
    return (
      <>
        <Num>{formatted}</Num>
        {hint}
      </>
    );
  }

  const cogs = findNumericMetricValue(metrics, "fin_cogs");
  const expenses = findNumericMetricValue(metrics, "fin_expenses");
  const grossMargin = computeGrossMargin(revenue, cogs);
  const netMargin = computeNetMargin(revenue, expenses);
  const revenueGrowth = percentChange(revenue, previousRevenue);

  return (
    <Card className="min-w-0">
      <h2 className="font-heading text-sm font-semibold text-foreground">{t.companyReport.metricsTitle}</h2>
      <div className="mt-3 grid grid-cols-1 gap-6 sm:grid-cols-2">
        {(["sectionFinancial", "sectionHealth", "sectionCustomer", "sectionQualitative"] as const).map((sectionKey) =>
          groups[sectionKey].length > 0 || sectionKey === "sectionFinancial" ? (
            <div key={sectionKey} className="min-w-0">
              <h3 className="text-sm font-semibold text-foreground">{t.submitReport[sectionKey]}</h3>
              <dl className="mt-2">
                {sectionKey === "sectionFinancial" ? (
                  <>
                    <MetricRow
                      label={t.companyReport.grossMarginLabel}
                      value={grossMargin === null ? naDisplay : <Num>{formatPercent(grossMargin, lang)}</Num>}
                    />
                    <MetricRow
                      label={t.companyReport.netMarginLabel}
                      value={netMargin === null ? naDisplay : <Num>{formatPercent(netMargin, lang)}</Num>}
                    />
                    <MetricRow
                      label={t.companyReport.revenueGrowthLabel}
                      value={revenueGrowth === null ? naDisplay : <Num>{formatPercent(revenueGrowth, lang)}</Num>}
                    />
                  </>
                ) : null}
                {groups[sectionKey].map((field) => (
                  <MetricRow
                    key={field.metricDefinitionId}
                    label={lang === "ar" ? field.labelAr : field.labelEn}
                    value={formatFieldValue(field)}
                  />
                ))}
              </dl>
            </div>
          ) : null
        )}
      </div>
    </Card>
  );
}
