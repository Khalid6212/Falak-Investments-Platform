"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { createReportingTemplateAction, type ActionState } from "../../actions";
import { labelClass, fieldClass, FormMessage, FieldError, fieldA11y, invalidClass, prefill, useEntityForm } from "./shared";

const METRIC_DATA_TYPES = ["Currency", "Percent", "Number", "Date", "Text", "Boolean"] as const;
// Matches MAX_METRIC_ROWS in the template actions.
const MAX_ROWS = 40;

export function CreateReportingTemplateForm() {
  const { state, formAction, isPending, formRef, formKey } = useEntityForm(createReportingTemplateAction);
  // Outside the remounting form, so the rows shown survive a rejected save.
  // Rows are form indexes; removing one leaves a gap the server skips.
  const [rows, setRows] = useState<number[]>([0, 1, 2]);
  const [nextRow, setNextRow] = useState(3);
  return (
    <TemplateFields
      key={formKey}
      state={state}
      formAction={formAction}
      formRef={formRef}
      isPending={isPending}
      rows={rows}
      canAdd={nextRow < MAX_ROWS}
      addRow={() => {
        setRows((r) => [...r, nextRow]);
        setNextRow((n) => n + 1);
      }}
      removeRow={(i) => setRows((r) => r.filter((x) => x !== i))}
    />
  );
}

function TemplateFields({
  state,
  formAction,
  formRef,
  isPending,
  rows,
  canAdd,
  addRow,
  removeRow,
}: {
  state: ActionState;
  formAction: (formData: FormData) => void;
  formRef: React.RefObject<HTMLFormElement | null>;
  isPending: boolean;
  rows: number[];
  canAdd: boolean;
  addRow: () => void;
  removeRow: (index: number) => void;
}) {
  const { t } = useLanguage();
  const value = (name: string) => prefill(state, undefined, name);
  const field = (id: string, name: string) => ({ id, name, ...fieldA11y(state, id, name), className: invalidClass });

  return (
    <form ref={formRef} action={formAction} noValidate className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className={fieldClass}>
          <label className={labelClass} htmlFor="tpl-nameEn">{t.admin.manage.nameEnLabel}</label>
          <Input {...field("tpl-nameEn", "nameEn")} required defaultValue={value("nameEn")} />
          <FieldError state={state} id="tpl-nameEn" name="nameEn" />
        </div>
        <div className={fieldClass}>
          <label className={labelClass} htmlFor="tpl-nameAr">{t.admin.manage.nameArLabel}</label>
          <Input {...field("tpl-nameAr", "nameAr")} dir="rtl" required defaultValue={value("nameAr")} />
          <FieldError state={state} id="tpl-nameAr" name="nameAr" />
        </div>
      </div>
      <label className="inline-flex items-start gap-2 text-sm text-foreground">
        <input type="checkbox" name="collectFinancialStatements" className="mt-1" defaultChecked={value("collectFinancialStatements") === "on"} />
        <span>
          {t.admin.manage.collectStatementsLabel}
          <span className="block text-xs text-muted-foreground">{t.admin.manage.collectStatementsHint}</span>
        </span>
      </label>

      <p className="text-xs text-muted-foreground">{t.admin.manage.metricKeyHint}</p>
      <div className="flex flex-col gap-3">
        {rows.map((i) => (
          <div key={i} className="chamfer-br-sm grid grid-cols-1 gap-2 p-3 shadow-[var(--inner-line)] sm:grid-cols-[1fr_1fr_1fr_1fr_auto]">
            {(
              [
                ["metricKey", t.admin.manage.metricKeyOptionalLabel, undefined],
                ["metricLabelEn", t.admin.manage.metricLabelEnLabel, undefined],
                ["metricLabelAr", t.admin.manage.metricLabelArLabel, "rtl"],
              ] as const
            ).map(([prefix, placeholder, dir]) => (
              <div key={prefix} className="flex flex-col gap-1">
                <Input
                  {...field(`tpl-${prefix}-${i}`, `${prefix}_${i}`)}
                  aria-label={placeholder}
                  placeholder={placeholder}
                  dir={dir}
                  defaultValue={value(`${prefix}_${i}`)}
                />
                <FieldError state={state} id={`tpl-${prefix}-${i}`} name={`${prefix}_${i}`} />
              </div>
            ))}
            <div className="flex flex-col gap-1">
              <Select
                {...field(`tpl-metricDataType-${i}`, `metricDataType_${i}`)}
                aria-label={t.admin.manage.metricDataTypeLabel}
                defaultValue={value(`metricDataType_${i}`)}
              >
                <option value="" disabled>{t.admin.manage.metricDataTypeLabel}</option>
                {METRIC_DATA_TYPES.map((dt) => (
                  <option key={dt} value={dt}>{dt}</option>
                ))}
              </Select>
              <FieldError state={state} id={`tpl-metricDataType-${i}`} name={`metricDataType_${i}`} />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="self-start text-danger"
              aria-label={t.admin.manage.removeRowAction}
              title={t.admin.manage.removeRowAction}
              disabled={rows.length <= 1}
              onClick={() => removeRow(i)}
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
      <Button type="button" variant="outline" className="w-fit" disabled={!canAdd} onClick={addRow}>
        {t.admin.manage.addMetricAction}
      </Button>

      <FormMessage state={state} />
      <Button type="submit" disabled={isPending} className="w-fit">
        {t.admin.manage.submitLabel}
      </Button>
    </form>
  );
}
