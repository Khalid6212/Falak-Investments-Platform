"use client";

import { useState } from "react";
import { useForm, type FormState } from "@/components/forms/useForm";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { correctInvestmentAction, removeInvestmentAction } from "@/app/admin/actions";
import type { CompanyInvestmentDTO } from "@/lib/company/dto";

const initial: FormState = { error: null };

/** Admin-only Correct / Remove for one recorded investment, shown under its row. */
export function InvestmentRowActions({ investment }: { investment: CompanyInvestmentDTO }) {
  const { t } = useLanguage();
  const p = t.companyProfile;
  const correct = useForm(correctInvestmentAction, initial, { resetOnSuccess: false });
  const remove = useForm(removeInvestmentAction, initial);
  // Form result current when the editor opened; a later success closes it.
  const [openedWith, setOpenedWith] = useState<FormState | null>(null);
  const editing = openedWith !== null && !(correct.state.success && correct.state !== openedWith);

  if (!editing) {
    return (
      <div className="flex flex-col items-start gap-1">
        <div className="flex gap-1">
          <Button type="button" variant="outline" size="xs" onClick={() => setOpenedWith(correct.state)}>
            {p.correctAction}
          </Button>
          <form
            {...remove.formProps}
            onSubmit={(e) => {
              if (!window.confirm(p.removeConfirm)) {
                e.preventDefault();
                return;
              }
              remove.formProps.onSubmit(e);
            }}
          >
            <input type="hidden" name="agreementId" value={investment.id} />
            <Button type="submit" variant="ghost" size="xs" className="text-danger" disabled={remove.isPending}>
              {p.removeAction}
            </Button>
          </form>
        </div>
        {remove.state.error ? <p role="alert" className="text-xs font-semibold text-danger">{remove.state.error}</p> : null}
      </div>
    );
  }

  return (
    <form {...correct.formProps} className="flex flex-col gap-2 py-1">
      <input type="hidden" name="agreementId" value={investment.id} />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="flex flex-col gap-0.5">
          <Input name="investedAmount" aria-label={p.amountColumn} inputMode="decimal" defaultValue={investment.investedAmount ?? ""} className="h-8 text-xs" />
          {correct.errorFor("investedAmount")}
        </div>
        <div className="flex flex-col gap-0.5">
          <Select name="currency" aria-label={t.admin.filters.currencyLabel} defaultValue={investment.currency ?? ""} className="h-8 text-xs">
            <option value="" disabled>
              {t.admin.manage.selectPlaceholder}
            </option>
            <option value="SAR">SAR</option>
            <option value="USD">USD</option>
          </Select>
          {correct.errorFor("currency")}
        </div>
        <div className="flex flex-col gap-0.5">
          <Input name="signedDate" type="date" aria-label={p.signedColumn} defaultValue={investment.signedDate} className="h-8 text-xs" />
          {correct.errorFor("signedDate")}
        </div>
        <div className="flex flex-col gap-0.5">
          <Input
            name="ownershipPct"
            aria-label={t.admin.manage.ownershipPctOptionalLabel}
            placeholder={t.admin.manage.ownershipPctOptionalLabel}
            inputMode="decimal"
            defaultValue={investment.ownershipPct ?? ""}
            className="h-8 text-xs"
          />
          {correct.errorFor("ownershipPct")}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{p.correctionNote}</p>
      <div className="flex gap-1">
        <Button type="submit" size="xs" disabled={correct.isPending}>
          {t.admin.manage.saveChangesLabel}
        </Button>
        <Button type="button" variant="outline" size="xs" onClick={() => setOpenedWith(null)}>
          {t.admin.manage.cancelAction}
        </Button>
      </div>
      {correct.state.error && !correct.state.fieldErrors ? <p role="alert" className="text-xs font-semibold text-danger">{correct.state.error}</p> : null}
    </form>
  );
}
