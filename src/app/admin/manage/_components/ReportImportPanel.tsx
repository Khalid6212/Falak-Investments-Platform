"use client";

import { useState } from "react";
import { Download, FileSpreadsheet, X } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { useForm } from "@/components/forms/useForm";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { formatDate } from "@/lib/format";
import { importReportsAction, type ReportImportRowResult, type ReportImportState } from "../new-reporting-cycle/report-import-actions";
import { labelClass } from "./shared";
import type { AdminReportingTemplateDTO } from "@/lib/admin/dto";

const initialState: ReportImportState = { error: null };

const linkButton =
  "chamfer-br-sm inline-flex w-fit items-center gap-1.5 whitespace-nowrap px-3 py-1.5 text-sm font-bold text-foreground shadow-[inset_0_0_0_2px_var(--brand-dark-nebula)] hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-link-foreground";

/**
 * Backfill reports from Excel: pick the template, download its file, fill
 * one row per startup per period, check, then import. Each imported row is
 * a submitted report waiting for review.
 */
export function ReportImportPanel({ templates }: { templates: AdminReportingTemplateDTO[] }) {
  const { t, lang } = useLanguage();
  const m = t.admin.manage;
  const [open, setOpen] = useState(false);
  const [templateId, setTemplateId] = useState("");
  const { state, isPending, formProps } = useForm(importReportsAction, initialState);
  const rows = state.rows ?? [];
  const imported = state.mode === "import" && state.success;
  const ready = state.readyCount ?? 0;

  if (!open) {
    return (
      <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => setOpen(true)}>
        <FileSpreadsheet aria-hidden="true" className="h-4 w-4" />
        {m.reportImportAction}
      </Button>
    );
  }

  function status(r: ReportImportRowResult) {
    if (r.problems.length > 0) {
      return (
        <ul className="space-y-0.5 text-danger">
          {r.problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      );
    }
    const main = imported ? (
      <span className={r.outcome === "imported" ? "text-nebula-aqua" : "font-semibold text-danger"}>
        {r.outcome === "imported" ? m.reportImportDoneLabel : m.reportImportFailedLabel}
      </span>
    ) : (
      <span className="text-nebula-aqua">{r.action === "fill" ? m.reportImportFillLabel : m.reportImportNewLabel}</span>
    );
    return (
      <div className="space-y-0.5">
        {main}
        <p className="text-muted-foreground">
          {m.reportImportAnsweredLabel.replace("{answered}", String(r.answeredCount)).replace("{total}", String(state.metricCount ?? 0))}
        </p>
        {r.missingRequired.length > 0 ? (
          <p className="text-foreground">{m.reportImportMissingLabel.replace("{fields}", r.missingRequired.join(", "))}</p>
        ) : null}
      </div>
    );
  }

  return (
    <Card padding="sm" className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-heading text-sm font-semibold text-foreground">{m.reportImportTitle}</h2>
          <p className="mt-1 max-w-3xl text-xs text-muted-foreground">{m.reportImportIntro}</p>
        </div>
        <Button type="button" variant="ghost" size="xs" aria-label={m.importCloseAction} title={m.importCloseAction} onClick={() => setOpen(false)}>
          <X aria-hidden="true" className="h-4 w-4" />
        </Button>
      </div>

      <form {...formProps} className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className={labelClass} htmlFor="report-import-template">
              {m.templateLabel}
            </label>
            <Select id="report-import-template" name="templateId" value={templateId} onChange={(e) => setTemplateId(e.target.value)} className="min-w-[16rem]">
              <option value="" disabled>
                {m.selectPlaceholder}
              </option>
              {templates.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>
                  {lang === "ar" ? tpl.nameAr : tpl.nameEn}
                </option>
              ))}
            </Select>
          </div>
          {templateId ? (
            <a href={`/api/import/reports/template?templateId=${encodeURIComponent(templateId)}`} className={linkButton}>
              <Download aria-hidden="true" className="h-4 w-4" />
              {m.reportImportTemplateAction}
            </a>
          ) : null}
        </div>
        <div className="flex flex-col gap-1">
          <label className={labelClass} htmlFor="report-import-file">
            {m.importFileLabel}
          </label>
          <input
            id="report-import-file"
            name="file"
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="text-sm text-foreground file:me-3 file:cursor-pointer file:border-0 file:bg-surface-muted file:px-3 file:py-1.5 file:text-sm file:font-medium"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" name="mode" value="preview" variant="outline" size="sm" disabled={isPending || !templateId}>
            {m.importCheckAction}
          </Button>
          {state.mode === "preview" && ready > 0 ? (
            <Button type="submit" name="mode" value="import" size="sm" disabled={isPending || !templateId}>
              {m.reportImportRunAction.replace("{count}", String(ready))}
            </Button>
          ) : null}
        </div>

        {state.error ? (
          <p role="alert" className="text-xs font-semibold text-danger">
            {state.error}
          </p>
        ) : null}
        {imported ? (
          <p role="status" className="text-sm font-medium text-nebula-aqua">
            {m.reportImportCountsMessage.replace("{count}", String(state.importedCount ?? 0))}
          </p>
        ) : state.mode === "preview" && rows.length > 0 ? (
          <p role="status" className="text-xs text-muted-foreground">
            {m.importReadyCount.replace("{ready}", String(ready)).replace("{total}", String(rows.length))}
          </p>
        ) : null}
        {state.ignoredColumns && state.ignoredColumns.length > 0 ? (
          <p className="text-xs text-foreground">{m.reportImportIgnoredColumns.replace("{columns}", state.ignoredColumns.join(", "))}</p>
        ) : null}
      </form>

      {rows.length > 0 ? (
        <div className="scrollbar-thin max-h-[28rem] overflow-y-auto">
          <table className="w-full text-start text-xs">
            <thead className="sticky top-0 bg-surface">
              <tr className="border-b border-border-subtle text-muted-foreground">
                <th className="px-2 py-1.5 text-start font-medium">{m.importRowColumn}</th>
                <th className="px-2 py-1.5 text-start font-medium">{m.startupColumn}</th>
                <th className="px-2 py-1.5 text-start font-medium">{m.cycleColumn}</th>
                <th className="px-2 py-1.5 text-start font-medium">{m.importStatusColumn}</th>
              </tr>
            </thead>
            <tbody>
              {[...rows]
                // Problems first, then the rest in file order.
                .sort((a, b) => Number(b.problems.length > 0) - Number(a.problems.length > 0) || a.rowNumber - b.rowNumber)
                .map((r) => (
                  <tr key={r.rowNumber} className="border-b border-border-subtle align-top last:border-0">
                    <td className="px-2 py-1.5 tabular-nums text-muted-foreground">{r.rowNumber}</td>
                    <td className="px-2 py-1.5 font-medium text-foreground">{r.startup}</td>
                    <td className="px-2 py-1.5 text-foreground">
                      {r.periodLabel}
                      {r.periodStart && r.periodEnd ? (
                        <span className="block text-muted-foreground">
                          {formatDate(r.periodStart, lang)} – {formatDate(r.periodEnd, lang)}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-2 py-1.5">{status(r)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </Card>
  );
}
