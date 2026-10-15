"use client";

import { BrandMark } from "@/components/brand/BrandMark";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useForm } from "@/components/forms/useForm";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { formatDate } from "@/lib/format";
import { METRIC_SECTIONS, MetricField, groupMetrics } from "@/app/submit/_components/MetricsEntryForm";
import { FileText } from "lucide-react";
import { formLinkAction, uploadStatementAction } from "./actions";
import type { FormLinkView, StatementUploadResult } from "@/lib/reporting/form-link";
import type { EntryResult } from "@/lib/reporting/entry-core";

const initialState: EntryResult = { error: null, success: false };
const initialUploadState: StatementUploadResult = { error: null, success: false };

/** Last year's financial statements, when the template asks for them. */
function StatementsCard({ token, year, files }: { token: string; year: number; files: { fileName: string; audited: boolean }[] }) {
  const { t } = useLanguage();
  const f = t.formLink;
  const { state, isPending, formProps } = useForm(uploadStatementAction.bind(null, token), initialUploadState);
  return (
    <Card padding="sm" className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-foreground">{f.statementsTitle.replace("{year}", String(year))}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{f.statementsHint}</p>
      </div>
      {files.length > 0 ? (
        <ul className="space-y-1">
          {files.map((file, i) => (
            <li key={i} className="flex items-center gap-2 text-sm text-foreground">
              <FileText aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
              <span className="break-all">{file.fileName}</span>
              {file.audited ? <span className="text-xs text-muted-foreground">({f.auditedTag})</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
      <form {...formProps} className="flex flex-wrap items-center gap-3">
        <input
          type="file"
          name="file"
          required
          accept=".pdf,.xlsx,.xls,.docx,.png,.jpg,.jpeg"
          aria-label={f.statementsTitle.replace("{year}", String(year))}
          className="max-w-full text-sm text-foreground file:me-3 file:border-0 file:bg-surface-muted file:px-3 file:py-1.5 file:text-sm"
        />
        <label className="inline-flex items-center gap-2 text-sm text-foreground">
          <input type="checkbox" name="audited" />
          {f.auditedLabel}
        </label>
        <Button type="submit" variant="outline" size="sm" disabled={isPending}>
          {isPending ? f.uploadingAction : f.uploadAction}
        </Button>
      </form>
      {state.error ? (
        <p role="alert" className="text-sm font-semibold text-danger">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p role="status" className="text-sm font-medium text-nebula-aqua">
          {f.uploadedMessage}
        </p>
      ) : null}
    </Card>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const { lang, setLang } = useLanguage();
  return (
    <main className="mx-auto w-full max-w-4xl space-y-5 px-4 py-8">
      <div className="flex items-center justify-between gap-3">
        <BrandMark />
        <button
          type="button"
          onClick={() => setLang(lang === "ar" ? "en" : "ar")}
          className="chamfer-br-sm px-3 py-1.5 text-sm font-medium text-foreground shadow-[inset_0_0_0_1px_var(--control-border)] hover:bg-surface-muted"
        >
          {lang === "ar" ? "English" : "العربية"}
        </button>
      </div>
      {children}
    </main>
  );
}

/** The report form opened from an emailed link -- no account or sign-in. */
export function FormLinkClient({ token, view }: { token: string; view: FormLinkView }) {
  const { t, lang } = useLanguage();
  const f = t.formLink;
  const { state, isPending, errorFor, formProps } = useForm(formLinkAction.bind(null, token), initialState, { resetOnSuccess: false });

  if (!view.ok) {
    return (
      <Shell>
        <Card>
          <h1 className="font-heading text-lg font-semibold text-foreground">{f.invalidTitle}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{f.invalidBody}</p>
        </Card>
      </Shell>
    );
  }

  const company = lang === "ar" ? view.companyNameAr : view.companyNameEn;
  const header = (
    <Card>
      <h1 className="font-heading text-lg font-semibold text-foreground">
        {f.title.replace("{period}", view.periodLabel).replace("{company}", company)}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">{f.dueLabel.replace("{date}", formatDate(view.currentDeadline, lang))}</p>
    </Card>
  );

  if (state.submitted || !view.editable) {
    return (
      <Shell>
        {header}
        <Card>
          <h2 className="font-heading text-base font-semibold text-foreground">{state.submitted ? f.submittedTitle : f.lockedTitle}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{f.lockedBody}</p>
        </Card>
      </Shell>
    );
  }

  const groups = groupMetrics(view.metrics);

  return (
    <Shell>
      {header}
      <p className="text-sm text-muted-foreground">{f.intro}</p>
      {view.collectStatements ? <StatementsCard token={token} year={view.statementsYear} files={view.statements} /> : null}
      <form {...formProps} className="space-y-5">
        <fieldset disabled={isPending} className="space-y-5">
          {METRIC_SECTIONS.map((sectionKey) =>
            groups[sectionKey].length > 0 ? (
              <Card key={sectionKey} padding="sm" className="space-y-3">
                <h2 className="text-sm font-semibold text-foreground">{t.submitReport[sectionKey]}</h2>
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
              </Card>
            ) : null
          )}
        </fieldset>
        <p className="text-xs text-muted-foreground">{f.requiredNote}</p>

        {state.error ? (
          <p role="alert" className="text-sm font-semibold text-danger">
            {state.error}
          </p>
        ) : null}
        {state.success && !state.submitted ? (
          <p role="status" className="text-sm font-medium text-nebula-aqua">
            {f.savedMessage}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button type="submit" name="intent" value="submit" disabled={isPending}>
            {f.submitAction}
          </Button>
          <Button type="submit" name="intent" value="save" variant="outline" disabled={isPending}>
            {f.saveAction}
          </Button>
        </div>
      </form>
    </Shell>
  );
}
