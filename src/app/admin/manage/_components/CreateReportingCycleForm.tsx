"use client";

import { useForm } from "@/components/forms/useForm";
import { useState } from "react";
import Link from "next/link";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { formatDate } from "@/lib/format";
import { createReportingCycleAction } from "../../actions";
import { ResendRequestButton } from "./ResendRequestButton";
import { ReminderSettingsFields } from "./ReminderSettingsFields";
import { DEFAULT_REMINDER_SETTINGS } from "@/lib/reporting/reminder-schedule";
import { useListView, byText, byValue } from "@/components/lists/useListView";
import { labelClass, fieldClass, initialActionState, FormMessage } from "./shared";
import type { AdminCompanyDTO, AdminReportingTemplateDTO } from "@/lib/admin/dto";
import type { ReportingRequestGroup } from "@/lib/admin/reporting-request-groups";

export function CreateReportingCycleForm({
  companies,
  templates,
  groups,
}: {
  companies: AdminCompanyDTO[];
  templates: AdminReportingTemplateDTO[];
  groups: ReportingRequestGroup[];
}) {
  const { t, lang } = useLanguage();
  const { state, isPending, errorFor, formProps } = useForm(createReportingCycleAction, initialActionState);
  // When set, the form adds startups to this already-sent request: its
  // template and period are fixed, and startups already on it are locked.
  const [addingKey, setAddingKey] = useState<string | null>(null);
  // Read from the latest server data, so startups just added show as sent.
  const addingTo = groups.find((g) => g.key === addingKey) ?? null;
  const activeCompanies = companies.filter((c) => !c.archivedAt);
  // "Ask for financial statements": pre-ticked from the chosen template, or
  // from the request being added to.
  const [askStatements, setAskStatements] = useState(false);
  const asking = addingTo ? addingTo.statementsYear !== null : askStatements;
  const alreadySent = new Set(addingTo?.companyIds ?? []);
  const companyName = (id: string) => {
    const c = companies.find((x) => x.id === id);
    return c ? (lang === "ar" ? c.nameAr : c.nameEn) : null;
  };
  const templateName = (g: ReportingRequestGroup) => (lang === "ar" ? g.templateNameAr : g.templateNameEn);
  const requestList = useListView(groups, {
    id: "sent-requests",
    searchText: (g) =>
      [g.periodLabel, g.templateNameEn, g.templateNameAr, ...g.companyIds.map((id) => {
        const c = companies.find((x) => x.id === id);
        return c ? `${c.nameEn} ${c.nameAr}` : "";
      })].join(" "),
    sorts: [
      byValue("periodDesc", t.lists.periodDesc, (g) => g.periodStart, true),
      byValue("periodAsc", t.lists.periodAsc, (g) => g.periodStart),
      byValue("deadline", t.lists.deadlineAsc, (g) => g.deadline),
      byText("template", t.lists.nameAsc, templateName),
    ],
  });

  return (
    <div className="flex flex-col gap-6">
      <form key={addingTo ? `${addingTo.key}:${addingTo.companyIds.length}` : "new"} {...formProps} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <p className="text-sm text-muted-foreground sm:col-span-2">
          {addingTo ? t.admin.manage.addingToRequestHint : t.admin.manage.newRequestHint}
        </p>
        <fieldset className="sm:col-span-2">
          <legend className={labelClass}>{t.admin.manage.companiesLabel}</legend>
          <div className="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {activeCompanies.map((c) => {
              const sent = alreadySent.has(c.id);
              return (
                <label
                  key={c.id}
                  className={`inline-flex items-center gap-1.5 text-sm ${sent ? "text-muted-foreground" : "text-foreground"}`}
                >
                  <input type="checkbox" name="companyIds" value={c.id} disabled={sent} defaultChecked={sent} />
                  {lang === "ar" ? c.nameAr : c.nameEn}
                  {sent ? <span className="text-xs">({t.admin.manage.alreadySentLabel})</span> : null}
                </label>
              );
            })}
          </div>
          {errorFor("companyIds")}
        </fieldset>

        {addingTo ? (
          <>
            <input type="hidden" name="templateId" value={addingTo.templateId} />
            <input type="hidden" name="periodLabel" value={addingTo.periodLabel} />
            <input type="hidden" name="periodStart" value={addingTo.periodStart} />
            <input type="hidden" name="periodEnd" value={addingTo.periodEnd} />
            <dl className="grid grid-cols-1 gap-2 text-sm sm:col-span-2 sm:grid-cols-3">
              <div>
                <dt className={labelClass}>{t.admin.manage.templateLabel}</dt>
                <dd className="text-foreground">{lang === "ar" ? addingTo.templateNameAr : addingTo.templateNameEn}</dd>
              </div>
              <div>
                <dt className={labelClass}>{t.admin.manage.periodLabelLabel}</dt>
                <dd className="text-foreground">{addingTo.periodLabel}</dd>
              </div>
              <div>
                <dt className={labelClass}>
                  {t.admin.manage.periodStartLabel} – {t.admin.manage.periodEndLabel}
                </dt>
                <dd className="text-foreground">
                  {formatDate(addingTo.periodStart, lang)} – {formatDate(addingTo.periodEnd, lang)}
                </dd>
              </div>
            </dl>
          </>
        ) : (
          <>
            <div className={fieldClass}>
              <label className={labelClass} htmlFor="cy-template">{t.admin.manage.templateLabel}</label>
              <Select
                id="cy-template"
                name="templateId"
                required
                defaultValue=""
                onChange={(e) => setAskStatements(templates.find((tpl) => tpl.id === e.target.value)?.collectFinancialStatements ?? false)}
              >
                <option value="" disabled>{t.admin.manage.selectPlaceholder}</option>
                {templates.map((tpl) => (
                  <option key={tpl.id} value={tpl.id}>{lang === "ar" ? tpl.nameAr : tpl.nameEn}</option>
                ))}
              </Select>
              {errorFor("templateId")}
            </div>
            <div className={fieldClass}>
              <label className={labelClass} htmlFor="cy-label">{t.admin.manage.periodLabelLabel}</label>
              <Input id="cy-label" name="periodLabel" required />
              {errorFor("periodLabel")}
            </div>
            <div className={fieldClass}>
              <label className={labelClass} htmlFor="cy-start">{t.admin.manage.periodStartLabel}</label>
              <Input id="cy-start" name="periodStart" type="date" required />
              {errorFor("periodStart")}
            </div>
            <div className={fieldClass}>
              <label className={labelClass} htmlFor="cy-end">{t.admin.manage.periodEndLabel}</label>
              <Input id="cy-end" name="periodEnd" type="date" required />
              {errorFor("periodEnd")}
            </div>
          </>
        )}

        <div className={fieldClass}>
          <label className={labelClass} htmlFor="cy-deadline">{t.admin.manage.deadlineLabel}</label>
          <Input id="cy-deadline" name="deadline" type="date" required defaultValue={addingTo?.deadline ?? ""} />
          {errorFor("deadline")}
        </div>
        {addingTo ? (
          addingTo.statementsYear !== null ? (
            <>
              <input type="hidden" name="askStatements" value="on" />
              <input type="hidden" name="statementsYear" value={addingTo.statementsYear} />
              <p className="text-sm text-muted-foreground sm:col-span-2">
                {t.admin.manage.statementsAskedNote.replace("{year}", String(addingTo.statementsYear))}
              </p>
            </>
          ) : null
        ) : (
          <div className="flex flex-wrap items-end gap-3 sm:col-span-2">
            <label className="inline-flex items-center gap-2 text-sm text-foreground">
              <input type="checkbox" name="askStatements" checked={asking} onChange={(e) => setAskStatements(e.target.checked)} />
              {t.admin.manage.askStatementsLabel}
            </label>
            {asking ? (
              <div className={fieldClass}>
                <label className={labelClass} htmlFor="cy-statements-year">{t.admin.manage.statementsYearLabel}</label>
                <Input
                  id="cy-statements-year"
                  name="statementsYear"
                  inputMode="numeric"
                  maxLength={4}
                  placeholder={t.admin.manage.statementsYearPlaceholder}
                  className="w-40"
                />
                {errorFor("statementsYear")}
              </div>
            ) : null}
          </div>
        )}
        {addingTo ? (
          <>
            {addingTo.reminders.remindersEnabled ? <input type="hidden" name="remindersEnabled" value="on" /> : null}
            {addingTo.reminders.overdueRemindersEnabled ? <input type="hidden" name="overdueRemindersEnabled" value="on" /> : null}
            <input type="hidden" name="reminderStartDays" value={addingTo.reminders.reminderStartDays} />
            <input type="hidden" name="reminderEveryDays" value={addingTo.reminders.reminderEveryDays} />
            <input type="hidden" name="overdueEveryDays" value={addingTo.reminders.overdueEveryDays} />
            <input type="hidden" name="overdueForDays" value={addingTo.reminders.overdueForDays} />
            <p className="text-sm text-muted-foreground sm:col-span-2">{t.admin.manage.remindersInheritedNote}</p>
          </>
        ) : (
          <div className="sm:col-span-2">
            <ReminderSettingsFields initial={DEFAULT_REMINDER_SETTINGS} errorFor={errorFor} />
          </div>
        )}
        <div className="sm:col-span-2">
          <FormMessage state={state} />
        </div>
        <div className="flex gap-2 sm:col-span-2">
          <Button type="submit" disabled={isPending} className="w-fit">
            {addingTo ? t.admin.manage.addCompaniesAction : t.admin.manage.submitLabel}
          </Button>
          {addingTo ? (
            <Button type="button" variant="outline" className="w-fit" onClick={() => setAddingKey(null)}>
              {t.admin.manage.cancelAction}
            </Button>
          ) : null}
        </div>
      </form>

      {groups.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h4 className="text-xs font-semibold text-muted-foreground">{t.admin.manage.sentRequestsTitle}</h4>
          <p className="text-xs text-muted-foreground">{t.admin.manage.sentRequestsHint}</p>
          {requestList.controls}
          {requestList.empty}
          <ul className="chamfer-br-md divide-y divide-border-subtle shadow-[var(--inner-line)]">
            {requestList.visible.map((g) => (
              <li key={g.key} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <Link
                    href={`/admin/manage/reporting-requests/request/${g.templateId}/${g.periodStart}/${g.periodEnd}`}
                    className="text-sm font-medium text-link-foreground underline-offset-2 hover:underline"
                  >
                    {g.periodLabel} · {lang === "ar" ? g.templateNameAr : g.templateNameEn}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {g.companyIds.map(companyName).filter(Boolean).join(", ")}
                  </p>
                </div>
                <div className="flex flex-wrap items-start gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    onClick={() => {
                      setAddingKey(g.key);
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                  >
                    {t.admin.manage.addCompaniesAction}
                  </Button>
                  <ResendRequestButton templateId={g.templateId} periodStart={g.periodStart} periodEnd={g.periodEnd} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
