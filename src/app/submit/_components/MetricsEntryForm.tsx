"use client";

import type { ReactNode } from "react";
import { isIsoDay } from "@/lib/reporting/metric-date";
import { useForm } from "@/components/forms/useForm";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { saveMetricValuesAction, type SaveMetricsState } from "../[slug]/actions";
import type { SubmissionMetricFieldDTO } from "@/lib/reporting/dto";
import type { Dictionary } from "@/lib/i18n/dictionary";

const initialState: SaveMetricsState = { error: null, success: false };

// Section grouping is a key-prefix convention (fin_/health_/cust_/qual_,
// plus the reused revenue_b2b), not a schema column -- see
// reporting/dto.ts's own comment on SubmissionMetricFieldDTO.key for why.
function sectionFor(key: string): keyof Pick<Dictionary["submitReport"], "sectionFinancial" | "sectionHealth" | "sectionCustomer" | "sectionQualitative"> {
  if (key === "revenue_b2b" || key.startsWith("fin_")) return "sectionFinancial";
  if (key.startsWith("health_")) return "sectionHealth";
  if (key.startsWith("cust_")) return "sectionCustomer";
  return "sectionQualitative";
}

export const METRIC_SECTIONS = ["sectionFinancial", "sectionHealth", "sectionCustomer", "sectionQualitative"] as const;

export function groupMetrics(metrics: SubmissionMetricFieldDTO[]) {
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

export function MetricField({
  field,
  lang,
  naLabel,
  error,
}: {
  field: SubmissionMetricFieldDTO;
  lang: "en" | "ar";
  naLabel: string;
  error: ReactNode;
}) {
  const label = lang === "ar" ? field.labelAr : field.labelEn;
  const inputName = `value_${field.metricDefinitionId}`;
  const naName = `na_${field.metricDefinitionId}`;

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={inputName} className="text-xs font-medium text-muted-foreground">
        {label}
        {field.required ? " *" : ""}
      </label>
      {field.dataType === "Text" ? (
        <Textarea id={inputName} name={inputName} defaultValue={field.value ?? ""} disabled={field.isNa} rows={3} />
      ) : field.dataType === "Boolean" ? (
        <Select id={inputName} name={inputName} defaultValue={field.value ?? ""} disabled={field.isNa}>
          <option value="" disabled>
            --
          </option>
          <option value="Yes">Yes</option>
          <option value="No">No</option>
        </Select>
      ) : field.dataType === "Date" ? (
        // An older answer that isn't a date stays visible to correct, not silently cleared.
        <Input
          id={inputName}
          name={inputName}
          type={field.value && !isIsoDay(field.value) ? "text" : "date"}
          placeholder="31/12/2026"
          defaultValue={field.value ?? ""}
          disabled={field.isNa}
        />
      ) : (
        <Input
          id={inputName}
          name={inputName}
          type="text"
          defaultValue={field.value ?? ""}
          disabled={field.isNa}
        />
      )}
      <label className="inline-flex w-fit items-center gap-1.5 text-xs text-muted-foreground">
        <input type="checkbox" name={naName} defaultChecked={field.isNa} />
        {naLabel}
      </label>
      {error}
    </div>
  );
}

interface MetricsEntryFormProps {
  companyId: string;
  submissionId: string;
  slug: string;
  metrics: SubmissionMetricFieldDTO[];
}

export function MetricsEntryForm({ companyId, submissionId, slug, metrics }: MetricsEntryFormProps) {
  const { t, lang } = useLanguage();
  const boundAction = saveMetricValuesAction.bind(null, companyId, submissionId, slug);
  const { state, isPending, errorFor, formProps } = useForm(boundAction, initialState, { resetOnSuccess: false });
  const groups = groupMetrics(metrics);

  if (metrics.length === 0) {
    return null;
  }

  return (
    <form {...formProps} className="space-y-6">
      {METRIC_SECTIONS.map((sectionKey) =>
        groups[sectionKey].length > 0 ? (
          <div key={sectionKey} className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">{t.submitReport[sectionKey]}</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {groups[sectionKey].map((field) => (
                <MetricField
                  key={field.metricDefinitionId}
                  field={field}
                  lang={lang}
                  naLabel={t.submitReport.naLabel}
                  error={errorFor(`value_${field.metricDefinitionId}`)}
                />
              ))}
            </div>
          </div>
        ) : null
      )}

      {state.error ? (
        <p role="alert" className="text-xs font-semibold text-danger">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p role="status" className="text-xs font-medium text-nebula-aqua">
          {t.submitReport.savedMessage}
        </p>
      ) : null}

      <Button type="submit" variant="outline" disabled={isPending}>
        {isPending ? t.submitReport.saving : t.submitReport.saveAction}
      </Button>
    </form>
  );
}
