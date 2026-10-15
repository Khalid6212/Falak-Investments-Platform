"use client";

import { useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useForm } from "@/components/forms/useForm";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { saveInvestorExposuresAction, type ExposureFormState } from "../investor-vehicle-assignment/exposure-actions";
import type { PositionExposureData } from "@/lib/admin/investor-exposure";

const initialState: ExposureFormState = { error: null };

/** Which startups an investor is exposed to through one vehicle, with amount and label per startup. */
export function InvestorExposureForm({ data }: { data: PositionExposureData }) {
  const { t, lang } = useLanguage();
  const m = t.admin.manage;
  const [scope, setScope] = useState(data.exposureScope);
  const { state, isPending, errorFor, formProps } = useForm(saveInvestorExposuresAction.bind(null, data.positionId), initialState, {
    resetOnSuccess: false,
  });
  const selected = scope === "SELECTED";

  return (
    <form {...formProps} className="space-y-4">
      <Card padding="sm" className="space-y-3">
        <p className="font-heading text-sm font-semibold text-foreground">
          {lang === "ar" ? data.investorNameAr : data.investorNameEn} ·{" "}
          <Link href={`/vehicle/${data.vehicleSlug}`} className="text-link-foreground underline-offset-2 hover:underline">
            {lang === "ar" ? data.vehicleNameAr : data.vehicleNameEn}
          </Link>
        </p>
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1 text-xs font-medium text-muted-foreground">{m.exposureScopeLabel}</legend>
          {(["ALL_STARTUPS", "SELECTED"] as const).map((value) => (
            <label key={value} className="inline-flex items-center gap-2 text-sm text-foreground">
              <input type="radio" name="exposureScope" value={value} checked={scope === value} onChange={() => setScope(value)} />
              {value === "ALL_STARTUPS" ? m.exposureAllOption : m.exposureSelectedOption}
            </label>
          ))}
        </fieldset>
        <p className="text-xs text-muted-foreground">{selected ? m.exposureSelectedNote : m.exposureAllNote}</p>
      </Card>

      {data.startups.length === 0 ? (
        <p className="text-sm text-muted-foreground">{m.exposureNoStartups}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-start text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="px-2 py-2 text-start font-medium">{m.exposureIncludedColumn}</th>
                <th className="px-2 py-2 text-start font-medium">{m.startupColumn}</th>
                <th className="px-2 py-2 text-start font-medium">{m.exposureAmountColumn}</th>
                <th className="px-2 py-2 text-start font-medium">{t.admin.filters.currencyLabel}</th>
                <th className="px-2 py-2 text-start font-medium">{m.exposureOwnershipColumn}</th>
                <th className="px-2 py-2 text-start font-medium">{m.participationColumn}</th>
              </tr>
            </thead>
            <tbody>
              {data.startups.map((s) => {
                const e = s.exposure;
                return (
                  <tr key={s.companyId} className="border-b border-border-subtle align-top">
                    <td className="px-2 py-2">
                      {selected ? (
                        <input type="checkbox" name={`include_${s.companyId}`} defaultChecked={e !== null} aria-label={lang === "ar" ? s.companyNameAr : s.companyNameEn} />
                      ) : (
                        <span className="text-xs text-nebula-aqua">✓</span>
                      )}
                    </td>
                    <td className="px-2 py-2 font-medium">
                      <Link href={`/company/${s.companySlug}/profile`} className="text-link-foreground underline-offset-2 hover:underline">
                        {lang === "ar" ? s.companyNameAr : s.companyNameEn}
                      </Link>
                    </td>
                    <td className="px-2 py-2">
                      <Input name={`amount_${s.companyId}`} inputMode="decimal" defaultValue={e?.investedAmount ?? ""} className="h-8 w-32 text-xs" aria-label={m.exposureAmountColumn} />
                      {errorFor(`amount_${s.companyId}`)}
                    </td>
                    <td className="px-2 py-2">
                      <Select name={`currency_${s.companyId}`} defaultValue={e?.currency ?? data.currency} className="h-8 w-24 text-xs" aria-label={t.admin.filters.currencyLabel}>
                        <option value="SAR">SAR</option>
                        <option value="USD">USD</option>
                      </Select>
                      {errorFor(`currency_${s.companyId}`)}
                    </td>
                    <td className="px-2 py-2">
                      <Input name={`pct_${s.companyId}`} inputMode="decimal" placeholder="0.05" defaultValue={e?.ownershipPct ?? ""} className="h-8 w-24 text-xs" aria-label={m.exposureOwnershipColumn} />
                      {errorFor(`pct_${s.companyId}`)}
                    </td>
                    <td className="px-2 py-2">
                      <Select name={`participation_${s.companyId}`} defaultValue={e?.participation ?? ""} className="h-8 w-40 text-xs" aria-label={m.participationColumn}>
                        <option value="">—</option>
                        <option value="NETWORK_MEMBER">{m.participationNetwork}</option>
                        <option value="SYNDICATE_MEMBER">{m.participationSyndicate}</option>
                        <option value="FALAK_TEAM">{m.participationFalakTeam}</option>
                        <option value="FALAK">{m.participationFalak}</option>
                      </Select>
                      {errorFor(`participation_${s.companyId}`)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {state.error ? (
        <p role="alert" className="text-xs font-semibold text-danger">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p role="status" className="text-xs font-medium text-nebula-aqua">
          {m.exposureSavedMessage}
        </p>
      ) : null}
      <Button type="submit" disabled={isPending} className="w-fit">
        {t.admin.manage.saveChangesLabel}
      </Button>
    </form>
  );
}
