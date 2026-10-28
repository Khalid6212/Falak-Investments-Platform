"use client";

import { useState } from "react";
import { Download, FileSpreadsheet, X } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useForm } from "@/components/forms/useForm";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { importConfirmName } from "@/lib/admin/import-confirm";
import { importCompaniesAction, type ImportRowResult, type ImportState } from "../new-company/import-actions";
import { labelClass } from "./shared";

const initialState: ImportState = { error: null };
const FORM_ID = "company-import-form";

const linkButton =
  "chamfer-br-sm inline-flex w-fit items-center gap-1.5 whitespace-nowrap px-3 py-1.5 text-sm font-bold text-foreground shadow-[inset_0_0_0_2px_var(--brand-dark-nebula)] hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-link-foreground";

/**
 * Add or update many startups from the Excel template: check first, then
 * import. Rows matching a startup already on the platform fill its empty
 * fields; changes to existing values are listed with a tick box each and
 * only the ticked ones are applied.
 */
export function CompanyImportPanel() {
  const { t } = useLanguage();
  const m = t.admin.manage;
  const [open, setOpen] = useState(false);
  const { state, isPending, formProps } = useForm(importCompaniesAction, initialState);
  const rows = state.rows ?? [];
  const imported = state.mode === "import" && state.success;
  const ready = state.readyCount ?? 0;

  // Ticks belong to one check result: a new Check file starts with none, so
  // a change is never applied on the strength of an earlier tick.
  const [ticks, setTicks] = useState<{ forState: ImportState; names: Set<string> }>({ forState: state, names: new Set() });
  const ticked = ticks.forState === state ? ticks.names : new Set<string>();
  const allChangeNames = rows.flatMap((r) => (r.problems.length === 0 && r.companyId ? r.changes.map((c) => importConfirmName(r.companyId!, c.field)) : []));
  const setTicked = (names: Set<string>) => setTicks({ forState: state, names });
  const toggle = (name: string) => {
    const next = new Set(ticked);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    setTicked(next);
  };

  if (!open) {
    return (
      <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => setOpen(true)}>
        <FileSpreadsheet aria-hidden="true" className="h-4 w-4" />
        {m.importStartupsAction}
      </Button>
    );
  }

  const value = (text: string) => (text === "" ? <span className="italic text-muted-foreground">{m.importEmptyValue}</span> : text);

  function result(r: ImportRowResult) {
    if (r.problems.length > 0) {
      return (
        <ul className="space-y-0.5 text-danger">
          {r.problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      );
    }
    if (imported) {
      return (
        <span className={r.outcome === "skipped" ? "text-muted-foreground" : "text-nebula-aqua"}>
          {r.outcome === "added" ? m.importAddedLabel : r.outcome === "updated" ? m.importUpdatedLabel : m.importSkippedLabel}
        </span>
      );
    }
    if (r.kind === "new") return <span className="text-nebula-aqua">{m.importNewLabel}</span>;
    if (r.kind === "unchanged") return <span className="text-muted-foreground">{m.importNoChangeLabel}</span>;
    return (
      <div className="space-y-1.5">
        {r.fills.length > 0 ? (
          <div>
            <p className="font-medium text-nebula-aqua">{m.importFillsLabel}</p>
            <ul className="mt-0.5 space-y-0.5 text-foreground">
              {r.fills.map((f) => (
                <li key={f.field}>
                  {f.label}: <span dir="auto">{f.to}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {r.changes.length > 0 ? (
          <div>
            <p className="font-medium text-foreground">{m.importChangesLabel}</p>
            <ul className="mt-0.5 space-y-1">
              {r.changes.map((c) => {
                const name = importConfirmName(r.companyId!, c.field);
                return (
                  <li key={c.field}>
                    <label className="inline-flex items-start gap-1.5 text-foreground">
                      <input type="checkbox" form={FORM_ID} name={name} checked={ticked.has(name)} onChange={() => toggle(name)} className="mt-0.5" />
                      <span>
                        {c.label}: <span dir="auto" className="text-muted-foreground line-through">{value(c.from)}</span> →{" "}
                        <span dir="auto" className="font-medium">{value(c.to)}</span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </div>
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

      <form {...formProps} id={FORM_ID} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label className={labelClass} htmlFor="import-file">
            {m.importFileLabel}
          </label>
          <input
            id="import-file"
            name="file"
            type="file"
            accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            className="text-sm text-foreground file:me-3 file:cursor-pointer file:border-0 file:bg-surface-muted file:px-3 file:py-1.5 file:text-sm file:font-medium"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" name="mode" value="preview" variant="outline" size="sm" disabled={isPending}>
            {m.importCheckAction}
          </Button>
          {state.mode === "preview" && ready > 0 ? (
            <Button type="submit" name="mode" value="import" size="sm" disabled={isPending}>
              {m.importRunAction.replace("{count}", String(ready))}
            </Button>
          ) : null}
          {state.mode === "preview" && allChangeNames.length > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => setTicked(ticked.size === allChangeNames.length ? new Set() : new Set(allChangeNames))}
            >
              {ticked.size === allChangeNames.length ? m.importUntickAllAction : m.importTickAllAction}
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
            {m.importCountsMessage.replace("{created}", String(state.createdCount ?? 0)).replace("{updated}", String(state.updatedCount ?? 0))}
            {rows.some((r) => r.problems.length > 0) ? ` ${m.importSkippedNote}` : ""}
          </p>
        ) : state.mode === "preview" && rows.length > 0 ? (
          <div className="space-y-1 text-xs text-muted-foreground">
            <p role="status">{m.importReadyCount.replace("{ready}", String(ready)).replace("{total}", String(rows.length))}</p>
            {rows.some((r) => r.kind === "update") ? <p>{m.importBackupNote}</p> : null}
          </div>
        ) : null}
      </form>

      {rows.length > 0 ? (
        <div className="scrollbar-thin max-h-[28rem] overflow-y-auto">
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
                // Problems first, then rows with changes to confirm, then the rest.
                .sort(
                  (a, b) =>
                    Number(b.problems.length > 0) - Number(a.problems.length > 0) ||
                    Number(b.changes.length > 0) - Number(a.changes.length > 0) ||
                    a.rowNumber - b.rowNumber
                )
                .map((r) => (
                  <tr key={r.rowNumber} className="border-b border-border-subtle align-top last:border-0">
                    <td className="px-2 py-1.5 tabular-nums text-muted-foreground">{r.rowNumber}</td>
                    <td className="px-2 py-1.5 font-medium text-foreground">{r.nameEn}</td>
                    <td className="px-2 py-1.5">{result(r)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </Card>
  );
}
