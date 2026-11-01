"use client";

import { useState } from "react";
import { useForm } from "@/components/forms/useForm";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { archiveReportingCycleAction, deleteReportingCycleAction, restoreReportingCycleAction } from "../../actions";
import { labelClass, initialActionState } from "./shared";

function ErrorLine({ error }: { error: string | null }) {
  return error ? (
    <p role="alert" className="max-w-[14rem] text-xs font-semibold text-danger">
      {error}
    </p>
  ) : null;
}

export function RestoreCycleButton({ cycleId }: { cycleId: string }) {
  const { t } = useLanguage();
  const { state, isPending, formProps } = useForm(restoreReportingCycleAction, initialActionState);
  return (
    <form {...formProps} className="flex flex-col gap-1">
      <input type="hidden" name="cycleId" value={cycleId} />
      <Button type="submit" variant="outline" size="xs" disabled={isPending}>
        {t.admin.manage.restoreAction}
      </Button>
      <ErrorLine error={state.error} />
    </form>
  );
}

/**
 * One startup's reporting cycle: staff can Archive it; admins can also
 * Delete it, confirmed by typing the startup's name. The server enforces
 * both; `canDelete` only decides what's shown.
 */
export function CycleRemoveControls({
  cycleId,
  companyNameEn,
  canDelete,
  archived = false,
}: {
  cycleId: string;
  companyNameEn: string;
  canDelete: boolean;
  /** Already archived: only Delete applies. */
  archived?: boolean;
}) {
  const { t } = useLanguage();
  const m = t.admin.manage;
  const archive = useForm(archiveReportingCycleAction, initialActionState);
  const remove = useForm(deleteReportingCycleAction, initialActionState);
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const matches = typed.trim() === companyNameEn.trim();

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap gap-1">
        {!archived ? (
          <form {...archive.formProps} className="flex flex-1">
            <input type="hidden" name="cycleId" value={cycleId} />
            <Button type="submit" variant="outline" size="xs" block disabled={archive.isPending}>
              {m.archiveAction}
            </Button>
          </form>
        ) : null}
        {canDelete ? (
          <Button type="button" variant="outline" size="xs" onClick={() => setConfirming((v) => !v)} aria-expanded={confirming} className="flex-1">
            {m.deleteAction}
          </Button>
        ) : null}
      </div>
      <ErrorLine error={archive.state.error} />
      {canDelete && confirming ? (
        <form {...remove.formProps} className="flex max-w-[16rem] flex-col gap-1 pt-1">
          <input type="hidden" name="cycleId" value={cycleId} />
          <p className="text-xs text-foreground">{m.deleteCycleWarning}</p>
          <label className={labelClass} htmlFor={`delete-cycle-${cycleId}`}>
            {m.deleteConfirmLabel} <span className="font-semibold text-foreground">{companyNameEn}</span>
          </label>
          <Input id={`delete-cycle-${cycleId}`} name="confirmName" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />
          <ErrorLine error={remove.state.error} />
          <Button
            type="submit"
            size="xs"
            disabled={!matches || remove.isPending}
            className="w-fit bg-danger! text-white! hover:opacity-90 disabled:bg-border-subtle! disabled:text-muted-foreground!"
          >
            {m.deleteAction}
          </Button>
        </form>
      ) : null}
    </div>
  );
}
