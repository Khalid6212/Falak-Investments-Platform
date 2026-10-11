"use server";

import { db } from "@/lib/db";
import type { Department } from "@/generated/prisma/client";
import { requireFalakRoleWithDepartmentScope } from "@/lib/auth/department-scope";
import { isAuthError, GENERIC_ACCESS_DENIED } from "@/lib/auth/action-error";
import { writeAuditEvent } from "@/lib/audit/write-audit-event";
import { parseCompanyImport } from "@/lib/admin/company-import";

export interface ImportRowResult {
  rowNumber: number;
  nameEn: string;
  problems: string[];
}

export interface ImportState {
  error: string | null;
  success?: boolean;
  /** "preview" after Check file; "import" after Import. */
  mode?: "preview" | "import";
  rows?: ImportRowResult[];
  readyCount?: number;
  createdCount?: number;
}

// Server actions accept up to 1 MB by default; a startup list is far smaller.
const MAX_FILE_BYTES = 900 * 1024;

/**
 * Checks (mode "preview") or imports (mode "import") an Excel file of
 * startups. Import re-reads and re-checks the file itself -- nothing from
 * the earlier preview is trusted -- and creates only the rows without
 * problems, all together. Same role and department rules as adding one
 * startup by hand.
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
  if (!/\.xlsx$/i.test(file.name)) return { error: "Upload an .xlsx file (the template, filled in)." };

  // Live startups' names (duplicates are skipped) and every slug in use,
  // deleted ones included (the column is unique across all rows).
  const companies = await db.company.findMany({ select: { nameEn: true, slug: true, deletedAt: true } });
  const existing = {
    names: new Set(companies.filter((c) => !c.deletedAt).map((c) => c.nameEn.trim().toLowerCase())),
    slugs: new Set(companies.map((c) => c.slug.toLowerCase())),
  };

  const parsed = await parseCompanyImport(await file.arrayBuffer(), departments, existing);
  if (parsed.error) return { error: parsed.error, mode };
  const rows = parsed.rows.map(({ rowNumber, nameEn, problems }) => ({ rowNumber, nameEn, problems }));
  const ready = parsed.rows.filter((r) => r.input !== null);

  if (mode === "preview") {
    return { error: null, mode, rows, readyCount: ready.length };
  }
  if (ready.length === 0) {
    return { error: "No rows are ready to import. Fix the problems listed and check the file again.", mode: "preview", rows, readyCount: 0 };
  }

  try {
    await db.$transaction(async (tx) => {
      for (const row of ready) {
        const company = await tx.company.create({ data: row.input! });
        await writeAuditEvent(tx, {
          actorId: user.id,
          action: "company.created",
          targetType: "Company",
          targetId: company.id,
          meta: { source: "excel_import" },
        });
      }
    });
  } catch (error) {
    console.error("importCompaniesAction failed", error);
    return { error: "The import failed and nothing was added. Try again; if it keeps failing, check the file.", mode: "preview", rows };
  }

  return { error: null, success: true, mode, rows, readyCount: ready.length, createdCount: ready.length };
}
