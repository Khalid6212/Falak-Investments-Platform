"use client";

import { useState } from "react";
import { Pencil, Trash2, X } from "lucide-react";
import { useForm } from "@/components/forms/useForm";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { updateReportingTemplateAction } from "../../actions";
import { labelClass, fieldClass, initialActionState, FormMessage } from "./shared";
import type { TemplateForEdit } from "@/lib/admin/template-edit";

const METRIC_DATA_TYPES = ["Currency", "Percent", "Number", "Text", "Boolean"] as const;
// Matches MAX_METRIC_ROWS in the template actions.
const MAX_NEW_ROWS = 40;

export function EditReportingTemplateForm({ template }: { template: TemplateForEdit }) {
  const { t } = useLanguage();
  const { state, isPending, errorFor, formProps } = useForm(updateReportingTemplateAction, initialActionState, {
    resetOnSuccess: false,
  });
  // New, unsaved rows by their form index; removing one leaves a gap the
  // server simply skips.
  const [newRows, setNewRows] = useState<number[]>([]);
  const [nextRow, setNextRow] = useState(0);
  // Saved metrics marked for deletion; removed when the form is saved.
  const [deleting, setDeleting] = useState<Set<string>>(new Set());
  const toggleDelete = (id: string) =>
    setDeleting((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  // Answered metrics opened with Edit: their key and data type become editable.
  const [unlocked, setUnlocked] = useState<Set<string>>(new Set());
  const unlock = (id: string) => setUnlocked((prev) => new Set(prev).add(id));

  return (
    <form {...formProps} className="flex flex-col gap-4">
      <input type="hidden" name="templateId" value={template.id} />
      {template.cycleCount > 0 ? (
        <p className="text-sm text-muted-foreground">
          {t.admin.manage.templateInUseNote.replace("{count}", String(template.cycleCount))}
        </p>
      ) : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className={fieldClass}>
          <label className={labelClass} htmlFor="tpl-nameEn">{t.admin.manage.nameEnLabel}</label>
          <Input id="tpl-nameEn" name="nameEn" required defaultValue={template.nameEn} />
          {errorFor("nameEn")}
        </div>
        <div className={fieldClass}>
          <label className={labelClass} htmlFor="tpl-nameAr">{t.admin.manage.nameArLabel}</label>
          <Input id="tpl-nameAr" name="nameAr" dir="rtl" required defaultValue={template.nameAr} />
          {errorFor("nameAr")}
        </div>
      </div>
      <label className="inline-flex items-center gap-2 text-sm text-foreground">
        <input type="checkbox" name="templateActive" defaultChecked={template.isActive} />
        {t.admin.manage.templateActiveLabel}
      </label>
      <label className="inline-flex items-start gap-2 text-sm text-foreground">
        <input type="checkbox" name="collectFinancialStatements" className="mt-1" defaultChecked={template.collectFinancialStatements} />
        <span>
          {t.admin.manage.collectStatementsLabel}
          <span className="block text-xs text-muted-foreground">{t.admin.manage.collectStatementsHint}</span>
        </span>
      </label>

      <div className="flex flex-col gap-3">
        {template.metrics.map((m) =>
          deleting.has(m.id) ? (
            <div key={m.id} className="chamfer-br-sm flex flex-wrap items-center justify-between gap-2 bg-surface-muted p-3 shadow-[var(--inner-line)]">
              <input type="hidden" name={`delete_${m.id}`} value="on" />
              <p className="text-xs text-muted-foreground">
                {t.admin.manage.metricDeletePendingNote.replace("{name}", m.labelEn || m.key || "—")}
              </p>
              <Button type="button" variant="outline" size="xs" onClick={() => toggleDelete(m.id)}>
                {t.admin.manage.undoAction}
              </Button>
            </div>
          ) : (
          <div key={m.id} className="chamfer-br-sm flex flex-col gap-2 p-3 shadow-[var(--inner-line)]">
            {unlocked.has(m.id) ? <input type="hidden" name={`unlock_${m.id}`} value="on" /> : null}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_1fr_10rem_5rem]">
              <div className="flex flex-col gap-1">
                <Input aria-label={t.admin.manage.metricKeyLabel} name={`key_${m.id}`} defaultValue={m.key} disabled={m.hasValues && !unlocked.has(m.id)} />
                {errorFor(`key_${m.id}`)}
              </div>
              <div className="flex flex-col gap-1">
                <Input aria-label={t.admin.manage.metricLabelEnLabel} name={`labelEn_${m.id}`} defaultValue={m.labelEn} />
                {errorFor(`labelEn_${m.id}`)}
              </div>
              <div className="flex flex-col gap-1">
                <Input aria-label={t.admin.manage.metricLabelArLabel} name={`labelAr_${m.id}`} dir="rtl" defaultValue={m.labelAr} />
                {errorFor(`labelAr_${m.id}`)}
              </div>
              <div className="flex flex-col gap-1">
                <Select
                  aria-label={t.admin.manage.metricDataTypeLabel}
                  name={`dataType_${m.id}`}
                  defaultValue={m.dataType}
                  disabled={m.hasValues && !unlocked.has(m.id)}
                >
                  {METRIC_DATA_TYPES.map((dt) => (
                    <option key={dt} value={dt}>{dt}</option>
                  ))}
                </Select>
                {errorFor(`dataType_${m.id}`)}
              </div>
              <div className="flex flex-col gap-1">
                <Input
                  aria-label={t.admin.manage.metricOrderLabel}
                  name={`sortOrder_${m.id}`}
                  type="number"
                  step={1}
                  defaultValue={String(m.sortOrder)}
                />
                {errorFor(`sortOrder_${m.id}`)}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
              <label className="inline-flex items-center gap-1.5 text-foreground">
                <input type="checkbox" name={`required_${m.id}`} defaultChecked={m.required} />
                {t.admin.manage.metricRequiredLabel}
              </label>
              <label className="inline-flex items-center gap-1.5 text-foreground">
                <input type="checkbox" name={`isActive_${m.id}`} defaultChecked={m.isActive} />
                {t.admin.manage.metricActiveLabel}
              </label>
              {m.hasValues ? (
                <span>{unlocked.has(m.id) ? t.admin.manage.metricUnlockedNote : t.admin.manage.metricLockedNote}</span>
              ) : null}
              {m.hasValues && !unlocked.has(m.id) ? (
                <Button type="button" variant="ghost" size="xs" className="ms-auto" onClick={() => unlock(m.id)}>
                  <Pencil aria-hidden="true" className="me-1 h-3.5 w-3.5" />
                  {t.admin.manage.editMetricAction}
                </Button>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                size="xs"
                className={`${m.hasValues && !unlocked.has(m.id) ? "" : "ms-auto "}text-danger`}
                onClick={() => toggleDelete(m.id)}
              >
                <Trash2 aria-hidden="true" className="me-1 h-3.5 w-3.5" />
                {t.admin.manage.deleteMetricAction}
              </Button>
            </div>
          </div>
          )
        )}

        {newRows.map((i) => (
          <div key={`new-${i}`} className="chamfer-br-sm grid grid-cols-1 gap-2 p-3 shadow-[var(--inner-line)] sm:grid-cols-[1fr_1fr_1fr_1fr_auto]">
            <div className="flex flex-col gap-1">
              <Input name={`newKey_${i}`} placeholder={t.admin.manage.metricKeyOptionalLabel} />
              {errorFor(`newKey_${i}`)}
            </div>
            <div className="flex flex-col gap-1">
              <Input name={`newLabelEn_${i}`} placeholder={t.admin.manage.metricLabelEnLabel} />
              {errorFor(`newLabelEn_${i}`)}
            </div>
            <div className="flex flex-col gap-1">
              <Input name={`newLabelAr_${i}`} dir="rtl" placeholder={t.admin.manage.metricLabelArLabel} />
              {errorFor(`newLabelAr_${i}`)}
            </div>
            <div className="flex flex-col gap-1">
              <Select name={`newDataType_${i}`} defaultValue="">
                <option value="" disabled>{t.admin.manage.metricDataTypeLabel}</option>
                {METRIC_DATA_TYPES.map((dt) => (
                  <option key={dt} value={dt}>{dt}</option>
                ))}
              </Select>
              {errorFor(`newDataType_${i}`)}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="self-start text-danger"
              aria-label={t.admin.manage.removeRowAction}
              title={t.admin.manage.removeRowAction}
              onClick={() => setNewRows((rows) => rows.filter((r) => r !== i))}
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
      <Button
        type="button"
        variant="outline"
        className="w-fit"
        disabled={nextRow >= MAX_NEW_ROWS}
        onClick={() => {
          setNewRows((rows) => [...rows, nextRow]);
          setNextRow((n) => n + 1);
        }}
      >
        {t.admin.manage.addMetricAction}
      </Button>

      <FormMessage state={state} />
      <Button type="submit" disabled={isPending} className="w-fit">
        {t.admin.manage.saveChangesLabel}
      </Button>
    </form>
  );
}
