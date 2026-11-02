"use client";

import { useState, type ReactNode } from "react";
import { isIsoDay } from "@/lib/reporting/metric-date";
import { useForm } from "@/components/forms/useForm";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { staffEntryAction, type StaffEntryState } from "@/app/admin/manage/reporting-requests/actions";
import type { SubmissionMetricFieldDTO } from "@/lib/reporting/dto";
import type { Dictionary } from "@/lib/i18n/dictionary";

const initialState: StaffEntryState = { error: null, success: false };

// Small, intentional duplicate of MetricsEntryForm's own field renderer
// (src/app/submit/_components/MetricsEntryForm.tsx) -- same reasoning
// MetricsBreakdown.tsx already gives for not sharing one: this is Falak
// correcting a company's reported values during review, a different
// actor and a different allowed-status window (changes_requested,
// submitted and under_review here, enforced server-side by
// staffSaveCycleValues) from the company's own draft-editing form, even
// though the input markup looks the same today.
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

function MetricField({
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
  const [isNa, setIsNa] = useState(field.isNa);

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={inputName} className="text-xs font-medium text-muted-foreground">
        {label}
        {field.required ? " *" : ""}
      </label>
      {field.dataType === "Text" ? (
        <Textarea id={inputName} name={inputName} defaultValue={field.value ?? ""} disabled={isNa} rows={3} />
      ) : field.dataType === "Boolean" ? (
        <Select id={inputName} name={inputName} defaultValue={field.value ?? ""} disabled={isNa}>
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
          disabled={isNa}
        />
      ) : (
        <Input id={inputName} name={inputName} type="text" defaultValue={field.value ?? ""} disabled={isNa} />
      )}
      {/* A disabled input isn't submitted; the field must still reach the save. */}
      {isNa ? <input type="hidden" name={inputName} value="" /> : null}
      <label className="inline-flex w-fit items-center gap-1.5 text-xs text-muted-foreground">
        <input type="checkbox" name={naName} checked={isNa} onChange={(e) => setIsNa(e.target.checked)} />
        {naLabel}
      </label>
      {error}
    </div>
  );
}

interface ReviewMetricsEditFormProps {
  cycleId: string;
  /** Changes requested: the fixed report can also go back into review. */
  canSubmit: boolean;
  metrics: SubmissionMetricFieldDTO[];
}

export function ReviewMetricsEditForm({ cycleId, canSubmit, metrics }: ReviewMetricsEditFormProps) {
  const { t, lang } = useLanguage();
  const { state, isPending, errorFor, formProps } = useForm(staffEntryAction.bind(null, cycleId), initialState, {
    resetOnSuccess: false,
  });
  const groups = groupMetrics(metrics);

  if (metrics.length === 0) {
    return null;
  }

  return (
    <form {...formProps} className="space-y-6">
      {(["sectionFinancial", "sectionHealth", "sectionCustomer", "sectionQualitative"] as const).map((sectionKey) =>
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
          {state.submitted ? t.admin.manage.entrySubmittedMessage : t.submitReport.savedMessage}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="intent" value="save" variant="outline" disabled={isPending}>
          {isPending ? t.submitReport.saving : t.reviewWorkspace.saveCorrectionsAction}
        </Button>
        {canSubmit ? (
          <Button type="submit" name="intent" value="submit" disabled={isPending}>
            {t.admin.manage.entrySubmitAction}
          </Button>
        ) : null}
      </div>
    </form>
  );
}
