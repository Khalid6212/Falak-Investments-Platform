"use server";

import { db } from "@/lib/db";
import type { Department } from "@/generated/prisma/client";
import { requireFalakRoleWithDepartmentScope } from "@/lib/auth/department-scope";
import { isAuthError, GENERIC_ACCESS_DENIED } from "@/lib/auth/action-error";
import { writeAuditEvent } from "@/lib/audit/write-audit-event";
import { writeMetricValues } from "@/lib/reporting/metrics";
import { parseReportImport, type ParsedReportRow } from "@/lib/admin/report-import";
import { loadImportCompanies, loadImportCycles, loadImportTemplate } from "@/lib/admin/report-import-context";

export interface ReportImportRowResult {
  rowNumber: number;
  startup: string;
  periodLabel: string;
  periodStart: string | null;
  periodEnd: string | null;
  answeredCount: number;
  missingRequired: string[];
  problems: string[];
  action: "new" | "fill" | null;
  /** After Import: what happened to the row. */
  outcome?: "imported" | "skipped";
}

export interface ReportImportState {
  error: string | null;
  success?: boolean;
  mode?: "preview" | "import";
  rows?: ReportImportRowResult[];
  metricCount?: number;
  ignoredColumns?: string[];
  readyCount?: number;
  importedCount?: number;
}

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/**
 * Checks (mode "preview") or imports (mode "import") an Excel file of past
 * reports for one template. Each ready row becomes that startup's reporting
 * cycle with a SUBMITTED report (or fills in and submits its unsent or
 * returned report for that period), ready for review like any other, so
 * once approved and published its figures show everywhere. Import re-reads
 * and re-checks the file -- nothing from the preview is trusted. Each row
 * is its own transaction: one failing row never undoes the others.
 * Same role and department rules as requesting a report.
 */
export async function importReportsAction(_prev: ReportImportState, formData: FormData): Promise<ReportImportState> {
  let user;
  let departments: Department[] | null = null;
  try {
    ({ user, departments } = await requireFalakRoleWithDepartmentScope("FALAK_OPERATIONS"));
  } catch (error) {
    if (isAuthError(error)) return { error: GENERIC_ACCESS_DENIED };
    throw error;
  }

  const mode = formData.get("mode") === "import" ? "import" : "preview";
  const templateId = formData.get("templateId");
  const file = formData.get("file");
  if (typeof templateId !== "string" || !templateId) return { error: "Choose the reporting template the file was made for." };
  if (!(file instanceof File) || file.size === 0) return { error: "Choose the Excel file to upload." };
  if (file.size > MAX_FILE_BYTES) return { error: "The file is too large. Keep it under 2 MB (or split it)." };

  const template = await loadImportTemplate(templateId);
  if (!template) return { error: "That reporting template wasn't found. Reload and try again." };
  const companies = await loadImportCompanies(departments);
  const cycles = await loadImportCycles(companies.map((c) => c.id));

  const parsed = await parseReportImport(await file.arrayBuffer(), template, companies, cycles, file.name);
  // The file as received, so a screenshot of the message shows what arrived.
  if (parsed.error) return { error: `${parsed.error} (File received: "${file.name}", ${Math.max(1, Math.round(file.size / 1024))} KB.)`, mode };

  const toResult = (r: ParsedReportRow, outcome?: ReportImportRowResult["outcome"]): ReportImportRowResult => ({
    rowNumber: r.rowNumber,
    startup: r.startup,
    periodLabel: r.periodLabel,
    periodStart: day(r.periodStart),
    periodEnd: day(r.periodEnd),
    answeredCount: r.answeredCount,
    missingRequired: r.missingRequired,
    problems: r.problems,
    action: r.action,
    outcome,
  });
  const ready = parsed.rows.filter((r) => r.action !== null);
  const base = { metricCount: template.metrics.length, ignoredColumns: parsed.ignoredColumns, readyCount: ready.length };

  if (mode === "preview") {
    return { error: null, mode, rows: parsed.rows.map((r) => toResult(r)), ...base };
  }
  if (ready.length === 0) return { error: "Nothing to import: every row has a problem.", mode: "preview", rows: parsed.rows.map((r) => toResult(r)), ...base };

  const definitionsById = new Map(template.metrics.map((m) => [m.id, m.dataType] as const));
  const comment = `Imported from Excel (${file.name.slice(0, 120)}).`;
  const imported = new Set<number>();
  for (const row of ready) {
    try {
      await db.$transaction(async (tx) => {
        let cycleId: string;
        let submissionId: string;
        let fromStatus: "draft" | "changes_requested" = "draft";
        if (row.action === "fill" && row.existing) {
          cycleId = row.existing.cycleId;
          if (row.existing.submissionId) {
            submissionId = row.existing.submissionId;
            fromStatus = row.existing.status === "changes_requested" ? "changes_requested" : "draft";
          } else {
            submissionId = (await tx.companySubmission.create({ data: { cycleId, status: "draft" }, select: { id: true } })).id;
          }
        } else {
          const cycle = await tx.reportingCycle.create({
            data: {
              companyId: row.companyId!,
              templateId: template.id,
              periodLabel: row.periodLabel,
              periodStart: row.periodStart!,
              periodEnd: row.periodEnd!,
              originalDeadline: row.deadline!,
              currentDeadline: row.deadline!,
              status: "Open",
            },
            select: { id: true },
          });
          cycleId = cycle.id;
          submissionId = (await tx.companySubmission.create({ data: { cycleId, status: "draft" }, select: { id: true } })).id;
          await writeAuditEvent(tx, {
            actorId: user.id,
            action: "reporting_cycle.created",
            targetType: "ReportingCycle",
            targetId: cycleId,
            meta: { via: "excel_import" },
          });
        }

        await writeMetricValues(tx, submissionId, row.values, definitionsById);
        // Pinned to the status just read: a report submitted meanwhile is left alone.
        const claim = await tx.companySubmission.updateMany({
          where: { id: submissionId, status: fromStatus },
          data: { status: "submitted", submittedById: user.id },
        });
        if (claim.count !== 1) throw new Error("status changed");
        const priorEvents = await tx.submissionWorkflowEvent.count({ where: { submissionId } });
        await tx.submissionWorkflowEvent.create({
          data: { submissionId, versionNo: priorEvents + 1, actorId: user.id, fromStatus, toStatus: "submitted", comment },
        });
        await writeAuditEvent(tx, {
          actorId: user.id,
          action: "submission.imported",
          targetType: "CompanySubmission",
          targetId: submissionId,
          meta: { file: file.name.slice(0, 120), row: row.rowNumber, values: row.values.length, missingRequired: row.missingRequired },
        });
      });
      imported.add(row.rowNumber);
    } catch (error) {
      console.error(`Report import row ${row.rowNumber} failed:`, error);
    }
  }

  return {
    error: null,
    success: true,
    mode,
    rows: parsed.rows.map((r) => toResult(r, r.action === null ? undefined : imported.has(r.rowNumber) ? "imported" : "skipped")),
    ...base,
    importedCount: imported.size,
  };
}
