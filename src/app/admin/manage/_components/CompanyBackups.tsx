"use client";

import { useForm, type FormState } from "@/components/forms/useForm";
import { Button } from "@/components/ui/Button";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { formatDate } from "@/lib/format";
import { restoreCompanyBackupAction } from "../../actions";
import type { BackupField, CompanyBackupDTO } from "@/lib/admin/company-backups";

const initial: FormState = { error: null };

function BackupRow({ backup, fieldLabel }: { backup: CompanyBackupDTO; fieldLabel: (f: BackupField) => string }) {
  const { t, lang } = useLanguage();
  const m = t.admin.manage;
  const restore = useForm(restoreCompanyBackupAction, initial);
  const time = new Date(backup.createdAt).toLocaleTimeString(lang === "ar" ? "ar-SA-u-nu-latn" : "en-US", { hour: "2-digit", minute: "2-digit" });
  const source = backup.source === "excel_import" ? m.backupSourceImport : backup.source === "restore" ? m.backupSourceRestore : m.backupSourceEdit;

  return (
    <li className="flex flex-wrap items-start justify-between gap-3 px-3 py-2">
      <div className="min-w-0 text-sm">
        <p className="text-foreground">
          {source} · <time dateTime={backup.createdAt}>{formatDate(backup.createdAt.slice(0, 10), lang)} {time}</time>
          {backup.actorEmail ? <span className="text-muted-foreground"> · {backup.actorEmail}</span> : null}
        </p>
        <p className="text-xs text-muted-foreground">
          {m.backupDiffersLabel}: {[...new Set(backup.differs.map(fieldLabel))].join(", ")}
        </p>
        {restore.state.error ? <p role="alert" className="text-xs font-semibold text-danger">{restore.state.error}</p> : null}
      </div>
      <form
        {...restore.formProps}
        onSubmit={(e) => {
          if (!window.confirm(m.restoreConfirm)) {
            e.preventDefault();
            return;
          }
          restore.formProps.onSubmit(e);
        }}
      >
        <input type="hidden" name="backupId" value={backup.id} />
        <Button type="submit" variant="outline" size="xs" disabled={restore.isPending}>
          {m.restoreAction}
        </Button>
      </form>
    </li>
  );
}

/** Admin-only: a startup's earlier details from the last 90 days, each restorable. */
export function CompanyBackups({ backups }: { backups: CompanyBackupDTO[] }) {
  const { t } = useLanguage();
  const m = t.admin.manage;
  const labels: Record<BackupField, string> = {
    nameEn: m.nameEnLabel,
    nameAr: m.nameArLabel,
    sectorEn: t.admin.table.sectorColumn,
    sectorAr: t.admin.table.sectorColumn,
    customerModel: t.admin.table.customerModelColumn,
    revenueModels: t.companyReport.revenueModelsLabel,
    currency: t.admin.filters.currencyLabel,
    entryStage: t.admin.table.entryStageColumn,
    currentStage: t.admin.table.currentStageColumn,
    department: m.departmentLabel,
    founderName: m.founderLabel,
    founderEmail: m.founderLabel,
    founderPhone: m.founderLabel,
    hqCity: m.headquartersLabel,
    hqCountry: m.headquartersLabel,
    website: m.websiteShortLabel,
  };
  // Several fields share a label (founder, headquarters, industry): list each once.
  const fieldLabel = (f: BackupField) => labels[f];

  return (
    <section aria-labelledby="backups-heading" className="space-y-2">
      <h2 id="backups-heading" className="font-heading text-sm font-semibold text-foreground">
        {m.backupsTitle}
      </h2>
      <p className="max-w-3xl text-xs text-muted-foreground">{m.backupsIntro}</p>
      {backups.length === 0 ? (
        <p className="text-sm text-muted-foreground">{m.noBackups}</p>
      ) : (
        <ul className="chamfer-br-md divide-y divide-border-subtle shadow-[var(--inner-line)]">
          {backups.map((b) => (
            <BackupRow key={b.id} backup={b} fieldLabel={fieldLabel} />
          ))}
        </ul>
      )}
    </section>
  );
}
