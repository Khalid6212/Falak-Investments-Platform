import "server-only";
import { db } from "@/lib/db";
import { sendChangesRequestedEmail, sendReportRequestEmail } from "@/lib/email/send-email";
import { errorMessage, logRequestEmails, type RequestEmailLogEntry } from "@/lib/reporting/request-email-log";
import { RECIPIENT_SELECT, createFormLink, formLinkUrl, investmentProfessionalCc, startupRecipients } from "@/lib/reporting/form-link";

export interface ReportRequestNotifyResult {
  emailed: string[];
  /** Kept for callers' messages; startups no longer need an invitation. */
  invited: string[];
  noContact: string[];
  failed: string[];
}

/** One reporting cycle to email about: the request for one startup. */
export interface NotifyCycleRef {
  cycleId: string;
  companyId: string;
}

/**
 * Emails a report request to each startup: to its active users and its
 * founder email, each with their own private link that opens the form
 * directly -- no platform account needed. Startups with no one to email
 * are reported back so staff know to add a contact. Every email is recorded
 * in the request email log. Never throws for a failed send; the request
 * already exists and a reminder or "Resend" can retry.
 */
export async function notifyReportRequest(
  cycles: NotifyCycleRef[],
  request: { periodLabel: string; deadline: Date },
  actorId: string
): Promise<ReportRequestNotifyResult> {
  const result: ReportRequestNotifyResult = { emailed: [], invited: [], noContact: [], failed: [] };
  const baseUrl = process.env.APP_BASE_URL;
  const deadline = request.deadline.toISOString().slice(0, 10);
  const cycleIdByCompany = new Map(cycles.map((c) => [c.companyId, c.cycleId]));
  const log: RequestEmailLogEntry[] = [];

  let companies;
  try {
    if (!baseUrl) throw new Error("APP_BASE_URL is not configured");
    companies = await db.company.findMany({
      where: { id: { in: [...cycleIdByCompany.keys()] }, archivedAt: null },
      select: { id: true, nameEn: true, ...RECIPIENT_SELECT },
    });
  } catch (error) {
    // The requests already exist; report delivery as failed rather than break.
    console.error("Report request emails could not be prepared:", error);
    return { ...result, failed: [`${cycles.length} startup(s)`] };
  }

  for (const company of companies) {
    const cycleId = cycleIdByCompany.get(company.id)!;
    const recipients = startupRecipients(company);
    if (recipients.length === 0) {
      result.noContact.push(company.nameEn);
      continue;
    }
    // The startup's investment professionals are copied once, on the first email.
    let cc = await investmentProfessionalCc(company.department, recipients);
    let anySent = false;
    for (const to of recipients) {
      try {
        const token = await createFormLink(db, cycleId, to);
        await sendReportRequestEmail(to, { companyName: company.nameEn, periodLabel: request.periodLabel, deadline, url: formLinkUrl(baseUrl!, token), cc });
        cc = [];
        anySent = true;
        log.push({ cycleId, recipientEmail: to, kind: "request", status: "sent", sentById: actorId });
      } catch (error) {
        console.error(`Report request email failed for ${company.nameEn}:`, error);
        log.push({ cycleId, recipientEmail: to, kind: "request", status: "failed", failureReason: errorMessage(error), sentById: actorId });
      }
    }
    (anySent ? result.emailed : result.failed).push(company.nameEn);
  }

  await logRequestEmails(log);
  return result;
}

/**
 * After Falak sends a submitted report back for changes: emails the
 * startup the reviewer's comment and a fresh link to the form (open for
 * editing again). Never throws -- the change request itself is already
 * saved; returns whether anyone was emailed.
 */
export async function notifyChangesRequested(submissionId: string, comment: string, actorId: string): Promise<boolean> {
  const baseUrl = process.env.APP_BASE_URL;
  const log: RequestEmailLogEntry[] = [];
  let anySent = false;
  try {
    if (!baseUrl) throw new Error("APP_BASE_URL is not configured");
    const submission = await db.companySubmission.findUnique({
      where: { id: submissionId },
      select: {
        cycle: {
          select: { id: true, periodLabel: true, currentDeadline: true, company: { select: { nameEn: true, ...RECIPIENT_SELECT } } },
        },
      },
    });
    if (!submission) return false;
    const { cycle } = submission;
    const recipients = startupRecipients(cycle.company);
    let cc = await investmentProfessionalCc(cycle.company.department, recipients);
    for (const to of recipients) {
      try {
        const token = await createFormLink(db, cycle.id, to);
        await sendChangesRequestedEmail(to, {
          cc,
          companyName: cycle.company.nameEn,
          periodLabel: cycle.periodLabel,
          deadline: cycle.currentDeadline.toISOString().slice(0, 10),
          comment,
          url: formLinkUrl(baseUrl, token),
        });
        cc = [];
        anySent = true;
        log.push({ cycleId: cycle.id, recipientEmail: to, kind: "changes_requested", status: "sent", sentById: actorId });
      } catch (error) {
        log.push({ cycleId: cycle.id, recipientEmail: to, kind: "changes_requested", status: "failed", failureReason: errorMessage(error), sentById: actorId });
      }
    }
  } catch (error) {
    console.error("Changes-requested email could not be sent:", error);
  }
  await logRequestEmails(log);
  return anySent;
}

/** One line for staff, e.g. "Emailed: A, B. No contact on file: C (add a founder email or invite a user)." */
export function describeNotifyResult(r: ReportRequestNotifyResult): string {
  const parts: string[] = [];
  if (r.emailed.length) parts.push(`Emailed: ${r.emailed.join(", ")}.`);
  if (r.invited.length) parts.push(`Invited founder by email: ${r.invited.join(", ")}.`);
  if (r.noContact.length) parts.push(`No contact on file, not emailed: ${r.noContact.join(", ")} (add a founder email or invite a user).`);
  if (r.failed.length) parts.push(`Email failed for: ${r.failed.join(", ")} (try "Resend").`);
  return parts.join(" ");
}
