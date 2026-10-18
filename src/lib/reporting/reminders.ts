import "server-only";
import { db } from "@/lib/db";
import { sendDeadlineReminderEmail, sendOverdueReminderEmail } from "@/lib/email/send-email";
import { errorMessage, logRequestEmails, type RequestEmailLogEntry } from "@/lib/reporting/request-email-log";
import { reminderDue } from "@/lib/reporting/reminder-schedule";
import { RECIPIENT_SELECT, createFormLink, formLinkUrl, investmentProfessionalCc, startupRecipients } from "@/lib/reporting/form-link";


function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export interface ReminderSendResult {
  cycleId: string;
  kind: "upcoming" | "overdue";
  recipientCount: number;
}

/**
 * Daily sweep over open cycles not yet turned in. Only cycles whose
 * reminders Falak staff switched on are considered; reminderDue
 * (reminder-schedule.ts) decides from each cycle's own settings whether an
 * "upcoming" or "overdue" reminder is due today. At most one per cycle per day.
 *
 * `now` is injectable so tests can drive it with a fixed clock instead of
 * depending on the real one; production/cron use leaves it as the default.
 */
export async function sendDueReminders(now: Date = new Date()): Promise<ReminderSendResult[]> {
  const baseUrl = process.env.APP_BASE_URL;
  if (!baseUrl) {
    throw new Error("APP_BASE_URL is not set.");
  }

  const cycles = await db.reportingCycle.findMany({
    where: {
      status: "Open",
      remindersEnabled: true,
      company: { archivedAt: null },
      OR: [{ submission: null }, { submission: { status: { in: ["draft", "changes_requested"] } } }],
    },
    select: {
      id: true,
      periodLabel: true,
      currentDeadline: true,
      lastReminderSentAt: true,
      lastReminderKind: true,
      remindersEnabled: true,
      reminderStartDays: true,
      reminderEveryDays: true,
      overdueRemindersEnabled: true,
      overdueEveryDays: true,
      overdueForDays: true,
      company: {
        select: { nameEn: true, ...RECIPIENT_SELECT },
      },
    },
  });

  const results: ReminderSendResult[] = [];

  for (const cycle of cycles) {
    const kind = reminderDue(cycle, cycle.currentDeadline, { at: cycle.lastReminderSentAt, kind: cycle.lastReminderKind }, now);
    if (!kind) continue;

    // The startup's users and its founder email; nobody needs an account,
    // each email carries its own link to the form.
    const recipients = startupRecipients(cycle.company);
    if (recipients.length === 0) continue;

    const deadlineLabel = toDateOnly(cycle.currentDeadline);

    const logKind = kind === "overdue" ? "reminder_overdue" : "reminder_upcoming";
    const log: RequestEmailLogEntry[] = [];
    try {
      // The startup's investment professionals are copied once, on the first email.
      let cc = await investmentProfessionalCc(cycle.company.department, recipients);
      for (const email of recipients) {
        try {
          const formUrl = formLinkUrl(baseUrl, await createFormLink(db, cycle.id, email));
          if (kind === "overdue") {
            await sendOverdueReminderEmail(email, cycle.company.nameEn, cycle.periodLabel, deadlineLabel, formUrl, cc);
          } else {
            await sendDeadlineReminderEmail(email, cycle.company.nameEn, cycle.periodLabel, deadlineLabel, formUrl, cc);
          }
          cc = [];
          log.push({ cycleId: cycle.id, recipientEmail: email, kind: logKind, status: "sent" });
        } catch (error) {
          log.push({ cycleId: cycle.id, recipientEmail: email, kind: logKind, status: "failed", failureReason: errorMessage(error) });
          throw error;
        }
      }
    } finally {
      await logRequestEmails(log);
    }

    await db.reportingCycle.update({
      where: { id: cycle.id },
      data: { lastReminderSentAt: now, lastReminderKind: kind },
    });

    results.push({ cycleId: cycle.id, kind, recipientCount: recipients.length });
  }

  return results;
}
