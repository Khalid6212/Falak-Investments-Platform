"use client";

import { Num } from "@/components/ui/Num";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { formatMetricValue } from "@/lib/reporting/metric-format";
import type { Currency } from "@/generated/prisma/client";
import type { SubmissionMetricFieldDTO } from "@/lib/reporting/dto";

/** The startup's submitted figures, read-only, once the report is approved. */
export function ReviewSubmittedValues({ metrics, currency }: { metrics: SubmissionMetricFieldDTO[]; currency: Currency }) {
  const { t, lang } = useLanguage();
  const na = <span className="text-muted-foreground">{t.companyReport.naValueDisplay}</span>;

  return (
    <details open className="chamfer-br-sm p-3 shadow-[var(--inner-line)]">
      <summary className="cursor-pointer text-xs font-medium text-foreground">{t.reviewWorkspace.submittedValuesTitle}</summary>
      <dl className="mt-2 grid grid-cols-1 gap-x-6 sm:grid-cols-2">
        {[...metrics]
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((field) => {
            const formatted = formatMetricValue(field, currency, lang);
            const isText = field.dataType === "Text";
            return (
              <div
                key={field.metricDefinitionId}
                className={`flex gap-3 border-b border-border-subtle py-1.5 text-sm ${isText ? "flex-col gap-1 sm:col-span-2" : "justify-between"}`}
              >
                <dt className="shrink-0 text-muted-foreground">{lang === "ar" ? field.labelAr : field.labelEn}</dt>
                <dd className={`min-w-0 break-words text-foreground ${isText ? "whitespace-pre-wrap text-start" : "text-end"}`}>
                  {formatted === null ? na : isText ? formatted : <Num>{formatted}</Num>}
                </dd>
              </div>
            );
          })}
      </dl>
    </details>
  );
}
