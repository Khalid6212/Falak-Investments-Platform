"use client";

import { useState } from "react";
import { useForm } from "@/components/forms/useForm";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { renameReportingPeriodAction } from "../../actions";
import { initialActionState, labelClass } from "./shared";

/** Renames a sent reporting request's period, e.g. "Q2" to "Q2 2026". */
export function RenamePeriodButton({
  templateId,
  periodStart,
  periodEnd,
  periodLabel,
}: {
  templateId: string;
  periodStart: string;
  periodEnd: string;
  periodLabel: string;
}) {
  const { t } = useLanguage();
  const m = t.admin.manage;
  const [open, setOpen] = useState(false);
  const { state, isPending, formProps, errorFor } = useForm(renameReportingPeriodAction, initialActionState, { resetOnSuccess: false });
  const inputId = `rename-period-${templateId}-${periodStart}-${periodEnd}`;

  return (
    <div className="flex flex-col gap-1">
      <Button type="button" variant="outline" size="xs" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        {m.renamePeriodAction}
      </Button>
      {open ? (
        <form {...formProps} className="flex max-w-[16rem] flex-col gap-1 pt-1">
          <input type="hidden" name="templateId" value={templateId} />
          <input type="hidden" name="periodStart" value={periodStart} />
          <input type="hidden" name="periodEnd" value={periodEnd} />
          <label className={labelClass} htmlFor={inputId}>
            {m.renamePeriodLabel}
          </label>
          <Input id={inputId} name="periodLabel" defaultValue={periodLabel} maxLength={50} required />
          {errorFor("periodLabel")}
          <p className="text-xs text-muted-foreground">{m.renamePeriodHint}</p>
          {state.success && !isPending ? (
            <p role="status" className="text-xs font-semibold text-foreground">
              {m.renamePeriodSaved}
            </p>
          ) : null}
          {state.error && !state.fieldErrors ? (
            <p role="alert" className="text-xs font-semibold text-danger">
              {state.error}
            </p>
          ) : null}
          <Button type="submit" size="xs" disabled={isPending} className="w-fit">
            {m.saveAction}
          </Button>
        </form>
      ) : null}
    </div>
  );
}
