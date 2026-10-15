"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Table, THead, TBody, Tr, Th, Td } from "@/components/ui/Table";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { useForm } from "@/components/forms/useForm";
import { useListView, byText, byValue } from "@/components/lists/useListView";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { formatDate } from "@/lib/format";
import { resendCycleRequestAction, setRequestStatementsAction } from "@/app/admin/actions";
import { Input } from "@/components/ui/Input";
import { initialActionState, FormMessage } from "../../_components/shared";
import type { ReportingRequestDetail, RequestStartupRow } from "@/lib/admin/reporting-request-detail";
import type { Dictionary } from "@/lib/i18n/dictionary";

const COLUMN_COUNT = 7;
const RESENDABLE = new Set(["draft", "changes_requested"]);
const LOCKED = new Set(["approved", "published"]);

const linkButton =
  "chamfer-br-sm inline-flex shrink-0 items-center justify-center whitespace-nowrap px-2 py-1 text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-link-foreground";

function kindLabel(kind: string, m: Dictionary["admin"]["manage"]): string {
  if (kind === "invite") return m.emailKindInvite;
  if (kind === "reminder_upcoming") return m.emailKindReminderUpcoming;
  if (kind === "reminder_overdue") return m.emailKindReminderOverdue;
  if (kind === "changes_requested") return m.emailKindChangesRequested;
  return m.emailKindRequest;
}

function dateTime(iso: string, lang: "en" | "ar"): string {
  const time = new Date(iso).toLocaleTimeString(lang === "ar" ? "ar-SA-u-nu-latn" : "en-US", { hour: "2-digit", minute: "2-digit" });
  return `${formatDate(iso.slice(0, 10), lang)} ${time}`;
}

function StartupRow({ row, fieldCount }: { row: RequestStartupRow; fieldCount: number }) {
  const { t, lang } = useLanguage();
  const m = t.admin.manage;
  const [showEmails, setShowEmails] = useState(false);
  const resend = useForm(resendCycleRequestAction, initialActionState);
  const status = row.submissionStatus ?? "draft";
  const dataLabel = LOCKED.has(status) ? m.viewDataAction : row.answeredCount > 0 ? m.editDataAction : m.enterDataAction;

  return (
    <Fragment>
      <Tr>
        <Td className="font-medium">
          <Link href={`/company/${row.companySlug}`} className="text-link-foreground underline-offset-2 hover:underline">
            {lang === "ar" ? row.companyNameAr : row.companyNameEn}
          </Link>
        </Td>
        <Td className="whitespace-nowrap">{row.periodLabel}</Td>
        <Td>
          {row.lastEmailedAt ? (
            <time dateTime={row.lastEmailedAt} className="whitespace-nowrap">
              {dateTime(row.lastEmailedAt, lang)}
            </time>
          ) : (
            <span className="text-muted-foreground">{m.neverEmailedValue}</span>
          )}
          {row.emails.length > 0 ? (
            <button
              type="button"
              onClick={() => setShowEmails((v) => !v)}
              aria-expanded={showEmails}
              className="mt-0.5 flex items-center gap-0.5 text-xs text-link-foreground hover:underline"
            >
              {m.emailHistoryAction.replace("{count}", String(row.emails.length))}
              {showEmails ? <ChevronUp aria-hidden="true" className="h-3 w-3" /> : <ChevronDown aria-hidden="true" className="h-3 w-3" />}
            </button>
          ) : null}
        </Td>
        <Td>{row.submissionStatus ? <StatusBadge status={row.submissionStatus} /> : t.admin.table.noDataValue}</Td>
        <Td className="whitespace-nowrap text-xs text-muted-foreground">
          {m.answeredOfLabel.replace("{answered}", String(row.answeredCount)).replace("{total}", String(fieldCount))}
        </Td>
        <Td className="whitespace-nowrap">
          <time dateTime={row.currentDeadline}>{formatDate(row.currentDeadline, lang)}</time>
        </Td>
        <Td>
          <div className="flex flex-col items-stretch gap-1">
            <Link
              href={`/admin/manage/reporting-requests/entry/${row.cycleId}`}
              className={`${linkButton} ${LOCKED.has(status) ? "text-foreground shadow-[inset_0_0_0_2px_var(--brand-dark-nebula)] hover:bg-surface-muted" : "bg-nebula-aqua text-dark-green hover:bg-[#00905b]"}`}
            >
              {dataLabel}
            </Link>
            {RESENDABLE.has(status) ? (
              <form {...resend.formProps} className="flex">
                <input type="hidden" name="cycleId" value={row.cycleId} />
                <Button type="submit" variant="outline" size="xs" block disabled={resend.isPending}>
                  {m.resendAction}
                </Button>
              </form>
            ) : null}
          </div>
          {resend.state.error ? <p role="alert" className="mt-1 max-w-[14rem] text-xs font-semibold text-danger">{resend.state.error}</p> : null}
          {resend.state.success && resend.state.notice ? (
            <p role="status" className="mt-1 max-w-[14rem] text-xs text-nebula-aqua">{resend.state.notice}</p>
          ) : null}
        </Td>
      </Tr>
      {showEmails ? (
        <Tr className="bg-surface-muted/50">
          <Td colSpan={COLUMN_COUNT} className="py-2">
            <ul className="space-y-1 text-xs">
              {row.emails.map((e) => (
                <li key={e.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                  <time dateTime={e.sentAt} className="whitespace-nowrap text-muted-foreground">
                    {dateTime(e.sentAt, lang)}
                  </time>
                  <span className="font-medium text-foreground">{kindLabel(e.kind, m)}</span>
                  <span className="break-all text-foreground">{e.recipientEmail}</span>
                  <span className={e.status === "sent" ? "text-nebula-aqua" : "font-semibold text-danger"}>
                    {e.status === "sent" ? m.emailSentLabel : m.emailFailedLabel}
                    {e.failureReason ? `: ${e.failureReason}` : ""}
                  </span>
                  <span className="text-muted-foreground">{e.sentByEmail ?? m.emailAutomaticLabel}</span>
                </li>
              ))}
            </ul>
          </Td>
        </Tr>
      ) : null}
    </Fragment>
  );
}

/** Turns the financial statements ask on or off for the whole request, or changes its year. */
function StatementsAskForm({ detail }: { detail: ReportingRequestDetail }) {
  const { t } = useLanguage();
  const m = t.admin.manage;
  const { state, isPending, errorFor, formProps } = useForm(setRequestStatementsAction, initialActionState, { resetOnSuccess: false });
  const [asking, setAsking] = useState(detail.statementsYear !== null);
  return (
    <form {...formProps} className="mt-3 flex flex-wrap items-end gap-3 border-t border-[var(--control-border)] pt-3">
      <input type="hidden" name="templateId" value={detail.templateId} />
      <input type="hidden" name="periodStart" value={detail.periodStart} />
      <input type="hidden" name="periodEnd" value={detail.periodEnd} />
      <label className="inline-flex items-center gap-2 text-sm text-foreground">
        <input type="checkbox" name="askStatements" checked={asking} onChange={(e) => setAsking(e.target.checked)} />
        {m.askStatementsLabel}
      </label>
      {asking ? (
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="req-statements-year">{m.statementsYearLabel}</label>
          <Input
            id="req-statements-year"
            name="statementsYear"
            inputMode="numeric"
            maxLength={4}
            defaultValue={detail.statementsYear ?? ""}
            placeholder={m.statementsYearPlaceholder}
            className="w-40"
          />
          {errorFor("statementsYear")}
        </div>
      ) : null}
      <Button type="submit" variant="outline" size="sm" disabled={isPending}>
        {m.saveChangesLabel}
      </Button>
      <p className="w-full text-xs text-muted-foreground">{m.statementsAskHint}</p>
      <div className="w-full">
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function RequestDetailClient({ detail }: { detail: ReportingRequestDetail }) {
  const { t, lang } = useLanguage();
  const m = t.admin.manage;
  const name = (r: RequestStartupRow) => (lang === "ar" ? r.companyNameAr : r.companyNameEn);
  const { visible, controls, empty } = useListView(detail.rows, {
    id: "request-startups",
    searchText: (r) => [r.companyNameEn, r.companyNameAr, r.submissionStatus ?? "", ...r.emails.map((e) => e.recipientEmail)].join(" "),
    sorts: [
      byText("nameAsc", t.lists.nameAsc, name),
      byValue("lastEmailed", t.lists.newestFirst, (r) => r.lastEmailedAt, true),
      byText("statusAsc", t.lists.statusAsc, (r) => r.submissionStatus),
      byValue("deadlineAsc", t.lists.deadlineAsc, (r) => r.currentDeadline),
    ],
  });
  const submitted = detail.rows.filter((r) => r.submissionStatus && !RESENDABLE.has(r.submissionStatus)).length;

  return (
    <div className="flex flex-col gap-4">
      <Card padding="sm">
        <p className="font-heading text-sm font-semibold text-foreground">
          {detail.periodLabel} · {lang === "ar" ? detail.templateNameAr : detail.templateNameEn}
        </p>
        <p className="text-xs text-muted-foreground">
          {formatDate(detail.periodStart, lang)} – {formatDate(detail.periodEnd, lang)} ·{" "}
          {m.requestStartupsCount.replace("{count}", String(detail.rows.length)).replace("{submitted}", String(submitted))}
        </p>
        <p className="mt-2 text-xs text-muted-foreground">{m.requestDetailIntro}</p>
        {!detail.emailLogAvailable ? <p className="mt-2 text-xs font-semibold text-danger">{m.emailLogUnavailable}</p> : null}
        <StatementsAskForm key={String(detail.statementsYear)} detail={detail} />
      </Card>

      {controls}
      {empty}
      <Table caption={m.requestDetailTitle}>
        <THead>
          <Tr>
            <Th>{m.startupColumn}</Th>
            <Th>{m.cycleColumn}</Th>
            <Th>{m.lastEmailedColumn}</Th>
            <Th>{t.admin.table.statusColumn}</Th>
            <Th>{m.dataColumn}</Th>
            <Th>{t.admin.reportingStatusPanel.deadlineColumn}</Th>
            <Th>
              <span className="sr-only">{m.enterDataAction}</span>
            </Th>
          </Tr>
        </THead>
        <TBody>
          {visible.map((row) => (
            <StartupRow key={row.cycleId} row={row} fieldCount={detail.fieldCount} />
          ))}
        </TBody>
      </Table>
    </div>
  );
}
