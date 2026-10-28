"use server";

import { db } from "@/lib/db";
import type { Department } from "@/generated/prisma/client";
import { requireFalakRoleWithDepartmentScope } from "@/lib/auth/department-scope";
import { isAuthError, GENERIC_ACCESS_DENIED } from "@/lib/auth/action-error";
import { writeAuditEvent } from "@/lib/audit/write-audit-event";
import { parseCompanyImport, type ExistingCompany, type FieldChange } from "@/lib/admin/company-import";
import { companySnapshot } from "@/lib/admin/company-backups";
import { importConfirmName } from "@/lib/admin/import-confirm";
import type { CompanyInput } from "@/lib/admin/entity-validation";

export interface ImportRowResult {
  rowNumber: number;
  nameEn: string;
  problems: string[];
  kind: "new" | "update" | "unchanged";
  companyId: string | null;
  fills: FieldChange[];
  changes: FieldChange[];
  /** After Import: what happened to the row. */
  outcome?: "added" | "updated" | "skipped";
}

export interface ImportState {
  error: string | null;
  success?: boolean;
  /** "preview" after Check file; "import" after Import. */
  mode?: "preview" | "import";
  rows?: ImportRowResult[];
  /** Rows that Import would act on (new startups + updates). */
  readyCount?: number;
  createdCount?: number;
  updatedCount?: number;
}

// Server actions accept up to 1 MB by default; a startup list is far smaller.
const MAX_FILE_BYTES = 900 * 1024;

/**
 * Checks (mode "preview") or imports (mode "import") an Excel file of
 * startups. Rows that match a startup already on the platform update it:
 * fields that are empty there are filled in, and values that differ are
 * applied only when their checkbox was ticked. Before any update the
 * startup's previous details are saved in the audit event (a backup that
 * can be restored). Import re-reads and re-checks the file itself --
 * nothing from the preview is trusted -- and applies everything together.
 * Same role and department rules as adding or editing a startup by hand.
 */
export async function importCompaniesAction(_prevState: ImportState, formData: FormData): Promise<ImportState> {
  let user;
  let departments: Department[] | null = null;
  try {
    ({ user, departments } = await requireFalakRoleWithDepartmentScope("FALAK_OPERATIONS"));
  } catch (error) {
    if (isAuthError(error)) return { error: GENERIC_ACCESS_DENIED };
    throw error;
  }

  const mode = formData.get("mode") === "import" ? "import" : "preview";
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose the Excel file to upload." };
  if (file.size > MAX_FILE_BYTES) return { error: "The file is too large. Keep it under 900 KB (about 300 startups)." };

  // Live startups are matched by name; every link name in use (deleted
  // startups included) is avoided, since that column is unique.
  const all = await db.company.findMany();
  const existing = {
    companies: all.filter((c) => !c.deletedAt) as unknown as ExistingCompany[],
    slugs: new Set(all.map((c) => c.slug.toLowerCase())),
  };

  const parsed = await parseCompanyImport(await file.arrayBuffer(), departments, existing, file.name);
  // The file as received, so a screenshot of the message shows what arrived.
  if (parsed.error) return { error: `${parsed.error} (File received: "${file.name}", ${Math.max(1, Math.round(file.size / 1024))} KB.)`, mode };

  const toResult = (r: (typeof parsed.rows)[number], outcome?: ImportRowResult["outcome"]): ImportRowResult => ({
    rowNumber: r.rowNumber,
    nameEn: r.nameEn,
    problems: r.problems,
    kind: r.kind,
    companyId: r.companyId,
    fills: r.fills,
    changes: r.changes,
    outcome,
  });
  const actionable = parsed.rows.filter((r) => r.problems.length === 0 && (r.kind === "new" ? r.input !== null : r.kind === "update"));

  if (mode === "preview") {
    return { error: null, mode, rows: parsed.rows.map((r) => toResult(r)), readyCount: actionable.length };
  }
  if (actionable.length === 0) {
    return {
      error: "Nothing to import. Fix the problems listed and check the file again.",
      mode: "preview",
      rows: parsed.rows.map((r) => toResult(r)),
      readyCount: 0,
    };
  }

  const byId = new Map(existing.companies.map((c) => [c.id, c] as const));
  const outcomes = new Map<number, ImportRowResult["outcome"]>();
  let createdCount = 0;
  let updatedCount = 0;
  try {
    await db.$transaction(async (tx) => {
      for (const row of actionable) {
        if (row.kind === "new") {
          const company = await tx.company.create({ data: row.input! });
          await writeAuditEvent(tx, {
            actorId: user.id,
            action: "company.created",
            targetType: "Company",
            targetId: company.id,
            meta: { source: "excel_import" },
          });
          outcomes.set(row.rowNumber, "added");
          createdCount++;
          continue;
        }

        // Fills always apply; a change only when its checkbox was ticked.
        const companyId = row.companyId!;
        const fields = [...row.fills.map((f) => f.field), ...row.changes.filter((c) => formData.get(importConfirmName(companyId, c.field)) !== null).map((c) => c.field)];
        if (fields.length === 0) {
          outcomes.set(row.rowNumber, "skipped");
          continue;
        }
        const data: Partial<CompanyInput> = {};
        for (const field of fields) {
          Object.assign(data, { [field]: row.values[field] });
          if (field === "sectorEn") data.sectorAr = row.values.sectorAr;
        }
        await tx.company.update({ where: { id: companyId }, data });
        await writeAuditEvent(tx, {
          actorId: user.id,
          action: "company.updated",
          targetType: "Company",
          targetId: companyId,
          meta: { source: "excel_import", fields, before: companySnapshot(byId.get(companyId) as unknown as Record<string, unknown>) },
        });
        outcomes.set(row.rowNumber, "updated");
        updatedCount++;
      }
    });
  } catch (error) {
    console.error("importCompaniesAction failed", error);
    return {
      error: "The import failed and nothing was changed. Try again; if it keeps failing, check the file.",
      mode: "preview",
      rows: parsed.rows.map((r) => toResult(r)),
      readyCount: actionable.length,
    };
  }

  return {
    error: null,
    success: true,
    mode,
    rows: parsed.rows.map((r) => toResult(r, outcomes.get(r.rowNumber) ?? "skipped")),
    readyCount: actionable.length,
    createdCount,
    updatedCount,
  };
}
