"use client";

import { useState } from "react";
import { Download, FileSpreadsheet, X } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useForm } from "@/components/forms/useForm";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { importCompaniesAction, type ImportState } from "../new-company/import-actions";
import { labelClass } from "./shared";

const initialState: ImportState = { error: null };

const linkButton =
  "chamfer-br-sm inline-flex w-fit items-center gap-1.5 whitespace-nowrap px-3 py-1.5 text-sm font-bold text-foreground shadow-[inset_0_0_0_2px_var(--brand-dark-nebula)] hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-link-foreground";

/** Add many startups at once from the Excel template: check first, then import. */
export function CompanyImportPanel() {
  const { t } = useLanguage();
  const m = t.admin.manage;
  const [open, setOpen] = useState(false);
  const { state, isPending, formProps } = useForm(importCompaniesAction, initialState);
  const rows = state.rows ?? [];
  const imported = state.mode === "import" && state.success;
  const ready = state.readyCount ?? 0;

  if (!open) {
    return (
      <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => setOpen(true)}>
        <FileSpreadsheet aria-hidden="true" className="h-4 w-4" />
        {m.importStartupsAction}
      </Button>
    );
  }

  return (
    <Card padding="sm" className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-heading text-sm font-semibold text-foreground">{m.importTitle}</h2>
          <p className="mt-1 max-w-3xl text-xs text-muted-foreground">{m.importIntro}</p>
        </div>
        <Button type="button" variant="ghost" size="xs" aria-label={m.importCloseAction} title={m.importCloseAction} onClick={() => setOpen(false)}>
          <X aria-hidden="true" className="h-4 w-4" />
        </Button>
      </div>

      <a href="/api/import/companies/template" className={linkButton}>
        <Download aria-hidden="true" className="h-4 w-4" />
        {m.importTemplateAction}
      </a>

      <form {...formProps} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label className={labelClass} htmlFor="import-file">
            {m.importFileLabel}
          </label>
          <input
            id="import-file"
            name="file"
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="text-sm text-foreground file:me-3 file:cursor-pointer file:border-0 file:bg-surface-muted file:px-3 file:py-1.5 file:text-sm file:font-medium"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" name="mode" value="preview" variant="outline" size="sm" disabled={isPending}>
            {m.importCheckAction}
          </Button>
          {state.mode === "preview" && ready > 0 ? (
            <Button type="submit" name="mode" value="import" size="sm" disabled={isPending}>
              {m.importRunAction.replace("{count}", String(ready))}
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
            {m.importDoneMessage.replace("{count}", String(state.createdCount ?? 0))}
            {rows.length > (state.createdCount ?? 0) ? ` ${m.importSkippedNote}` : ""}
          </p>
        ) : state.mode === "preview" && rows.length > 0 ? (
          <p role="status" className="text-xs text-muted-foreground">
            {m.importReadyCount.replace("{ready}", String(ready)).replace("{total}", String(rows.length))}
          </p>
        ) : null}
      </form>

      {rows.length > 0 ? (
        <div className="scrollbar-thin max-h-96 overflow-y-auto">
          <table className="w-full text-start text-xs">
            <thead className="sticky top-0 bg-surface">
              <tr className="border-b border-border-subtle text-muted-foreground">
                <th className="px-2 py-1.5 text-start font-medium">{m.importRowColumn}</th>
                <th className="px-2 py-1.5 text-start font-medium">{m.startupColumn}</th>
                <th className="px-2 py-1.5 text-start font-medium">{m.importStatusColumn}</th>
              </tr>
            </thead>
            <tbody>
              {[...rows]
                .sort((a, b) => Number(b.problems.length > 0) - Number(a.problems.length > 0) || a.rowNumber - b.rowNumber)
                .map((r) => (
                  <tr key={r.rowNumber} className="border-b border-border-subtle align-top last:border-0">
                    <td className="px-2 py-1.5 tabular-nums text-muted-foreground">{r.rowNumber}</td>
                    <td className="px-2 py-1.5 font-medium text-foreground">{r.nameEn}</td>
                    <td className="px-2 py-1.5">
                      {r.problems.length === 0 ? (
                        <span className="text-nebula-aqua">{imported ? m.importAddedLabel : m.importReadyLabel}</span>
                      ) : (
                        <ul className="space-y-0.5 text-danger">
                          {r.problems.map((p) => (
                            <li key={p}>{p}</li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </Card>
  );
}
