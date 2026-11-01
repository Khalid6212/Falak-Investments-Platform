import "server-only";
import { db } from "@/lib/db";
import { requireFalakRoleWithDepartmentScope } from "@/lib/auth/department-scope";
import type { ReminderSettings } from "@/lib/reporting/reminder-schedule";

export interface ReportingRequestCycleRef {
  cycleId: string;
  companyId: string;
  companyNameEn: string;
}

export interface ArchivedReportingCycle {
  cycleId: string;
  companyNameEn: string;
  companyNameAr: string;
  templateNameEn: string;
  templateNameAr: string;
  periodLabel: string;
  archivedAt: string;
}

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
  /** Startups added to the request get these reminder settings. */
  reminders: ReminderSettings;
  companyIds: string[];
  cycles: ReportingRequestCycleRef[];
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
      archivedAt: null,
      company: { archivedAt: null, ...(departments ? { department: { in: departments } } : {}) },
    },
    orderBy: { periodStart: "desc" },
    select: {
      id: true,
      companyId: true,
      company: { select: { nameEn: true } },
      templateId: true,
      periodLabel: true,
      periodStart: true,
      periodEnd: true,
      originalDeadline: true,
      statementsYear: true,
      remindersEnabled: true,
      reminderStartDays: true,
      reminderEveryDays: true,
      overdueRemindersEnabled: true,
      overdueEveryDays: true,
      overdueForDays: true,
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
      reminders: {
        remindersEnabled: c.remindersEnabled,
        reminderStartDays: c.reminderStartDays,
        reminderEveryDays: c.reminderEveryDays,
        overdueRemindersEnabled: c.overdueRemindersEnabled,
        overdueEveryDays: c.overdueEveryDays,
        overdueForDays: c.overdueForDays,
      },
      companyIds: [],
      cycles: [],
    };
    group.statementsYear ??= c.statementsYear;
    if (toDateOnly(c.originalDeadline) < group.deadline) group.deadline = toDateOnly(c.originalDeadline);
    group.companyIds.push(c.companyId);
    group.cycles.push({ cycleId: c.id, companyId: c.companyId, companyNameEn: c.company.nameEn });
    groups.set(key, group);
  }
  return [...groups.values()];
}

/** Archived (not deleted) startup requests, to restore or delete. Department-scoped. */
export async function getArchivedReportingCycles(): Promise<ArchivedReportingCycle[]> {
  const { departments } = await requireFalakRoleWithDepartmentScope("FALAK_OPERATIONS");
  const cycles = await db.reportingCycle.findMany({
    where: {
      archivedAt: { not: null },
      deletedAt: null,
      company: { archivedAt: null, ...(departments ? { department: { in: departments } } : {}) },
    },
    orderBy: { archivedAt: "desc" },
    select: {
      id: true,
      periodLabel: true,
      archivedAt: true,
      company: { select: { nameEn: true, nameAr: true } },
      template: { select: { nameEn: true, nameAr: true } },
    },
  });
  return cycles.map((c) => ({
    cycleId: c.id,
    companyNameEn: c.company.nameEn,
    companyNameAr: c.company.nameAr,
    templateNameEn: c.template.nameEn,
    templateNameAr: c.template.nameAr,
    periodLabel: c.periodLabel,
    archivedAt: c.archivedAt!.toISOString().slice(0, 10),
  }));
}
