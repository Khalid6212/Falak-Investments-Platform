import { formatCurrency, formatPercent, formatNumber, formatDate } from "@/lib/format";
import { isIsoDay } from "@/lib/reporting/metric-date";
import type { AppLocale } from "@/lib/format";
import type { Currency } from "@/generated/prisma/client";
import type { SubmissionMetricFieldDTO } from "./dto";

// Shared by MetricsBreakdown.tsx (the company report page's read-only
// grid) and QuarterlyReportDocument.tsx (the branded one-pager) -- both
// need "find this metric by key" and "format its value for display,"
// and keeping them in sync here means a dataType's display rule only
// ever needs to change in one place.

export function findMetric(metrics: SubmissionMetricFieldDTO[], key: string): SubmissionMetricFieldDTO | undefined {
  return metrics.find((m) => m.key === key);
}

export function findNumericMetricValue(metrics: SubmissionMetricFieldDTO[], key: string): number | null {
  const field = findMetric(metrics, key);
  if (!field || field.isNa || field.value === null) return null;
  const n = Number(field.value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Formats a metric's stored value for display, per its real dataType.
 * Returns null for isNa/missing -- callers render their own localized
 * N/A string, since this module has no i18n/dictionary access of its
 * own. Percent values are stored as the plain percentage figure the
 * startup typed (e.g. "5" for 5%), so this divides by 100 before handing
 * off to formatPercent's fraction-in convention -- the same convention
 * the computed margin/growth rows already use.
 */
export function formatMetricValue(field: SubmissionMetricFieldDTO, currency: Currency, lang: AppLocale): string | null {
  if (field.isNa || field.value === null) return null;
  switch (field.dataType) {
    case "Currency":
      return formatCurrency(Number(field.value), currency, lang);
    case "Number":
      return formatNumber(Number(field.value), lang);
    case "Percent":
      return formatPercent(Number(field.value) / 100, lang);
    case "Date":
      // Stored as YYYY-MM-DD; anything older that isn't shows as typed.
      return isIsoDay(field.value) ? formatDate(field.value, lang) : field.value;
    case "Boolean":
    case "Text":
      return field.value;
    default:
      return field.value;
  }
}
