import "server-only";
import { db } from "@/lib/db";
import { requireFalakRole } from "@/lib/auth/authorization";

export interface TemplateMetricForEdit {
  id: string;
  key: string;
  labelEn: string;
  labelAr: string;
  dataType: string;
  required: boolean;
  isActive: boolean;
  sortOrder: number;
  // Startups have entered values for it: key and data type are locked.
  hasValues: boolean;
}

export interface TemplateForEdit {
  id: string;
  nameEn: string;
  nameAr: string;
  isActive: boolean;
  collectFinancialStatements: boolean;
  cycleCount: number;
  metrics: TemplateMetricForEdit[];
}

/** One reporting template with its metrics, for the edit form. Falak staff. */
export async function getReportingTemplateForEdit(id: string): Promise<TemplateForEdit | null> {
  await requireFalakRole("FALAK_OPERATIONS");
  const template = await db.reportingTemplate.findUnique({
    where: { id },
    include: {
      _count: { select: { cycles: true } },
      metrics: {
        where: { deletedAt: null },
        orderBy: { sortOrder: "asc" },
        include: { _count: { select: { currentValues: true, snapshotValues: true } } },
      },
    },
  });
  if (!template) return null;
  return {
    id: template.id,
    nameEn: template.nameEn,
    nameAr: template.nameAr,
    isActive: template.isActive,
    collectFinancialStatements: template.collectFinancialStatements,
    cycleCount: template._count.cycles,
    metrics: template.metrics.map((m) => ({
      id: m.id,
      key: m.key,
      labelEn: m.labelEn,
      labelAr: m.labelAr,
      dataType: m.dataType,
      required: m.required,
      isActive: m.isActive,
      sortOrder: m.sortOrder,
      hasValues: m._count.currentValues + m._count.snapshotValues > 0,
    })),
  };
}
