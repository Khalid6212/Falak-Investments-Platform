import "server-only";
import type { Department } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import type { ExistingCycleRef, ImportTemplate } from "@/lib/admin/report-import";

/** The template (its active metrics, in form order), or null if unknown. */
export async function loadImportTemplate(templateId: string): Promise<ImportTemplate | null> {
  const template = await db.reportingTemplate.findUnique({
    where: { id: templateId },
    select: {
      id: true,
      nameEn: true,
      metrics: {
        where: { isActive: true, deletedAt: null },
        orderBy: { sortOrder: "asc" },
        select: { id: true, key: true, labelEn: true, dataType: true, required: true },
      },
    },
  });
  return template;
}

/** Startups the caller may import reports for: live ones in their department(s). */
export async function loadImportCompanies(departments: Department[] | null) {
  return db.company.findMany({
    where: { archivedAt: null, deletedAt: null, ...(departments ? { department: { in: departments } } : {}) },
    orderBy: { nameEn: "asc" },
    select: { id: true, nameEn: true, nameAr: true },
  });
}

/** Every existing cycle of these startups (any template), to catch periods already reported. */
export async function loadImportCycles(companyIds: string[]): Promise<ExistingCycleRef[]> {
  const cycles = await db.reportingCycle.findMany({
    where: { companyId: { in: companyIds } },
    select: {
      id: true,
      companyId: true,
      templateId: true,
      periodStart: true,
      periodEnd: true,
      template: { select: { nameEn: true } },
      submission: { select: { id: true, status: true } },
    },
  });
  return cycles.map((c) => ({
    companyId: c.companyId,
    templateId: c.templateId,
    templateNameEn: c.template.nameEn,
    periodStart: c.periodStart,
    periodEnd: c.periodEnd,
    cycleId: c.id,
    submissionId: c.submission?.id ?? null,
    status: c.submission?.status ?? null,
  }));
}
