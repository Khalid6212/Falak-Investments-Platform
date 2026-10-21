import "server-only";
import { db } from "@/lib/db";
import { requireFalakRoleWithDepartmentScope } from "@/lib/auth/department-scope";
import type { SubmissionStatus } from "@/generated/prisma/client";
import type { ReminderSettings } from "@/lib/reporting/reminder-schedule";
import { RECIPIENT_SELECT, startupCc, startupRecipients } from "@/lib/reporting/form-link";

export interface RequestEmailDTO {
  id: string;
  recipientEmail: string;
  kind: string;
  status: string;
  failureReason: string | null;
  sentAt: string;
  sentByEmail: string | null;
}

export interface RequestStartupRow {
  cycleId: string;
  companyId: string;
  companySlug: string;
  companyNameEn: string;
  companyNameAr: string;
  periodLabel: string;
  requestedAt: string;
  currentDeadline: string;
  submissionStatus: SubmissionStatus | null;
  /** How many of the template's fields have a value (or N/A). */
  answeredCount: number;
  /** Who the startup's report emails go to now (To) and who is copied (Cc), from its contacts. */
  emailTo: string[];
  emailCc: string[];
  lastEmailedAt: string | null;
  emails: RequestEmailDTO[];
}

export interface ReportingRequestDetail {
  templateId: string;
  templateNameEn: string;
  templateNameAr: string;
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  fieldCount: number;
  /** Financial statements year asked for, or null when not asked. */
  statementsYear: number | null;
  /** Deadline reminders for the request (as set on its first startup). */
  reminders: ReminderSettings;
  rows: RequestStartupRow[];
  /** False when the email log couldn't be read (rows then show no emails). */
  emailLogAvailable: boolean;
}

function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * One reporting request (template + period): every startup it went to,
 * each with its submission status and every email sent about it.
 * Department-scoped like the request list. Null when nothing matches.
 */
export async function getReportingRequestDetail(
  templateId: string,
  periodStart: string,
  periodEnd: string
): Promise<ReportingRequestDetail | null> {
  const { departments } = await requireFalakRoleWithDepartmentScope("FALAK_OPERATIONS");
  const start = new Date(periodStart);
  const end = new Date(periodEnd);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;

  const cycles = await db.reportingCycle.findMany({
    where: {
      templateId,
      periodStart: start,
      periodEnd: end,
      company: { archivedAt: null, ...(departments ? { department: { in: departments } } : {}) },
    },
    select: {
      id: true,
      periodLabel: true,
      openedAt: true,
      currentDeadline: true,
      statementsYear: true,
      remindersEnabled: true,
      reminderStartDays: true,
      reminderEveryDays: true,
      overdueRemindersEnabled: true,
      overdueEveryDays: true,
      overdueForDays: true,
      template: { select: { nameEn: true, nameAr: true, _count: { select: { metrics: { where: { isActive: true } } } } } },
      company: { select: { id: true, slug: true, nameEn: true, nameAr: true, ...RECIPIENT_SELECT } },
      submission: {
        select: {
          status: true,
          _count: { select: { metricValues: { where: { OR: [{ isNa: true }, { numericValue: { not: null } }, { textValue: { not: null } }] } } } },
        },
      },
    },
  });
  if (cycles.length === 0) return null;

  // Read separately so a problem with the log never hides the request itself.
  let emailLogAvailable = true;
  let emails: {
    id: string;
    cycleId: string;
    recipientEmail: string;
    kind: string;
    status: string;
    failureReason: string | null;
    sentAt: Date;
    sentBy: { email: string } | null;
  }[] = [];
  try {
    emails = await db.reportRequestEmail.findMany({
      where: { cycleId: { in: cycles.map((c) => c.id) } },
      orderBy: { sentAt: "desc" },
      select: {
        id: true,
        cycleId: true,
        recipientEmail: true,
        kind: true,
        status: true,
        failureReason: true,
        sentAt: true,
        sentBy: { select: { email: true } },
      },
    });
  } catch (error) {
    console.error("Could not read the report request email log:", error);
    emailLogAvailable = false;
  }

  const first = cycles[0];
  return {
    templateId,
    templateNameEn: first.template.nameEn,
    templateNameAr: first.template.nameAr,
    periodLabel: first.periodLabel,
    periodStart: toDateOnly(start),
    periodEnd: toDateOnly(end),
    fieldCount: first.template._count.metrics,
    statementsYear: cycles.find((c) => c.statementsYear !== null)?.statementsYear ?? null,
    reminders: {
      remindersEnabled: first.remindersEnabled,
      reminderStartDays: first.reminderStartDays,
      reminderEveryDays: first.reminderEveryDays,
      overdueRemindersEnabled: first.overdueRemindersEnabled,
      overdueEveryDays: first.overdueEveryDays,
      overdueForDays: first.overdueForDays,
    },
    emailLogAvailable,
    rows: cycles.map((c) => {
      const own = emails.filter((e) => e.cycleId === c.id);
      return {
        cycleId: c.id,
        companyId: c.company.id,
        companySlug: c.company.slug,
        companyNameEn: c.company.nameEn,
        companyNameAr: c.company.nameAr,
        periodLabel: c.periodLabel,
        requestedAt: c.openedAt.toISOString(),
        currentDeadline: toDateOnly(c.currentDeadline),
        submissionStatus: c.submission?.status ?? null,
        answeredCount: c.submission?._count.metricValues ?? 0,
        emailTo: startupRecipients(c.company),
        emailCc: startupCc(c.company, startupRecipients(c.company)),
        lastEmailedAt: own.find((e) => e.status === "sent")?.sentAt.toISOString() ?? null,
        emails: own.map((e) => ({
          id: e.id,
          recipientEmail: e.recipientEmail,
          kind: e.kind,
          status: e.status,
          failureReason: e.failureReason,
          sentAt: e.sentAt.toISOString(),
          sentByEmail: e.sentBy?.email ?? null,
        })),
      };
    }),
  };
}
