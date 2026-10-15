import "server-only";
import { db } from "@/lib/db";
import { requireFalakRoleWithDepartmentScope } from "@/lib/auth/department-scope";

export interface ReportingRequestGroup {
  key: string;
  templateId: string;
  templateNameEn: string;
  templateNameAr: string;
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  // The deadline the request was first sent with.
  deadline: string;
  /** Financial statements year asked for, or null when not asked. */
  statementsYear: number | null;
  companyIds: string[];
}

function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Every reporting request sent so far: one group per template + period,
 * with the startups it went to -- so more startups can be added to the
 * same request later. Limited to the caller's department like every
 * other staff list.
 */
export async function getReportingRequestGroups(): Promise<ReportingRequestGroup[]> {
  const { departments } = await requireFalakRoleWithDepartmentScope("FALAK_OPERATIONS");

  const cycles = await db.reportingCycle.findMany({
    where: {
      company: { archivedAt: null, ...(departments ? { department: { in: departments } } : {}) },
    },
    orderBy: { periodStart: "desc" },
    select: {
      companyId: true,
      templateId: true,
      periodLabel: true,
      periodStart: true,
      periodEnd: true,
      originalDeadline: true,
      statementsYear: true,
      template: { select: { nameEn: true, nameAr: true } },
    },
  });

  const groups = new Map<string, ReportingRequestGroup>();
  for (const c of cycles) {
    const key = `${c.templateId}|${toDateOnly(c.periodStart)}|${toDateOnly(c.periodEnd)}`;
    const group = groups.get(key) ?? {
      key,
      templateId: c.templateId,
      templateNameEn: c.template.nameEn,
      templateNameAr: c.template.nameAr,
      periodLabel: c.periodLabel,
      periodStart: toDateOnly(c.periodStart),
      periodEnd: toDateOnly(c.periodEnd),
      deadline: toDateOnly(c.originalDeadline),
      statementsYear: null,
      companyIds: [],
    };
    group.statementsYear ??= c.statementsYear;
    if (toDateOnly(c.originalDeadline) < group.deadline) group.deadline = toDateOnly(c.originalDeadline);
    group.companyIds.push(c.companyId);
    groups.set(key, group);
  }
  return [...groups.values()];
}
