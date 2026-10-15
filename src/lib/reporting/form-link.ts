import "server-only";
import { randomBytes } from "node:crypto";
import type { Currency, Prisma, SubmissionStatus } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { hashInviteToken } from "@/lib/auth/invite-token";
import { normalizeEmail } from "@/lib/auth/utils";
import { SUBMITTABLE_FROM_STATUSES } from "@/lib/reporting/submission-status";
import { fetchSubmissionMetricFields, type MetricValueInput } from "@/lib/reporting/metrics";
import { saveEntry, type EntryResult } from "@/lib/reporting/entry-core";
import type { SubmissionMetricFieldDTO } from "@/lib/reporting/dto";

// Startups report without a platform account: every email asking for a
// report (request, reminder, change request) carries a private link to that
// period's form. Whoever opens it can fill in and submit the report while
// it is open for the startup (draft / changes requested). Only the token's
// hash is stored, one link per email sent.

export const FORM_LINK_DAYS = 90;

/** Creates a link for one cycle and recipient; returns the raw token (only ever emailed). */
export async function createFormLink(client: Prisma.TransactionClient | typeof db, cycleId: string, email: string): Promise<string> {
  const rawToken = randomBytes(32).toString("hex");
  await client.reportFormLink.create({
    data: {
      cycleId,
      email: normalizeEmail(email),
      tokenHash: hashInviteToken(rawToken),
      expiresAt: new Date(Date.now() + FORM_LINK_DAYS * 24 * 60 * 60 * 1000),
    },
  });
  return rawToken;
}

export function formLinkUrl(baseUrl: string, rawToken: string): string {
  return `${baseUrl}/r/${rawToken}`;
}

/** Everyone a startup's report emails go to: its active users plus its founder email. */
export function startupRecipients(company: {
  founderEmail: string | null;
  memberships: { user: { email: string } }[];
}): string[] {
  const emails = company.memberships.map((m) => normalizeEmail(m.user.email));
  if (company.founderEmail) emails.push(normalizeEmail(company.founderEmail));
  return [...new Set(emails)];
}

/** Select for the people a startup's report emails go to. */
export const RECIPIENT_SELECT = {
  founderEmail: true,
  memberships: {
    where: { revokedAt: null, user: { deactivatedAt: null } },
    select: { user: { select: { email: true } } },
  },
} as const;

export type FormLinkView =
  | { ok: false }
  | {
      ok: true;
      companyNameEn: string;
      companyNameAr: string;
      currency: Currency;
      periodLabel: string;
      currentDeadline: string;
      status: SubmissionStatus;
      editable: boolean;
      metrics: SubmissionMetricFieldDTO[];
    };

async function findLink(rawToken: string) {
  if (!/^[a-f0-9]{64}$/.test(rawToken)) return null;
  const link = await db.reportFormLink.findUnique({
    where: { tokenHash: hashInviteToken(rawToken) },
    select: {
      id: true,
      email: true,
      expiresAt: true,
      revokedAt: true,
      cycle: {
        select: {
          id: true,
          templateId: true,
          periodLabel: true,
          currentDeadline: true,
          company: { select: { nameEn: true, nameAr: true, currency: true, archivedAt: true, deletedAt: true } },
          submission: { select: { id: true, status: true } },
        },
      },
    },
  });
  if (!link || link.revokedAt || link.expiresAt < new Date()) return null;
  if (link.cycle.company.archivedAt || link.cycle.company.deletedAt) return null;
  return link;
}

/**
 * What the link's page shows. Not valid (unknown, expired, revoked, or the
 * startup is gone) -> { ok: false }, with no hint as to which.
 */
export async function getFormLinkView(rawToken: string): Promise<FormLinkView> {
  const link = await findLink(rawToken);
  if (!link) return { ok: false };
  const { cycle } = link;
  // Every request is created with a draft submission; an older one without
  // its submission gets it now.
  const submission =
    cycle.submission ?? (await db.companySubmission.create({ data: { cycleId: cycle.id, status: "draft" }, select: { id: true, status: true } }));
  return {
    ok: true,
    companyNameEn: cycle.company.nameEn,
    companyNameAr: cycle.company.nameAr,
    currency: cycle.company.currency,
    periodLabel: cycle.periodLabel,
    currentDeadline: cycle.currentDeadline.toISOString().slice(0, 10),
    status: submission.status,
    editable: SUBMITTABLE_FROM_STATUSES.includes(submission.status),
    metrics: await fetchSubmissionMetricFields(db, submission.id, cycle.templateId),
  };
}

const INVALID_LINK = "This link is no longer valid. Ask Falak for a new one at info@falak.sa.";
const LOCKED = "This report has already been submitted, so it can't be changed through this link.";

/** Saves (and with `submit`, submits) the report through a link. */
export async function saveViaFormLink(rawToken: string, values: MetricValueInput[], submit: boolean): Promise<EntryResult> {
  const link = await findLink(rawToken);
  if (!link?.cycle.submission) return { error: INVALID_LINK, success: false };
  const submission = link.cycle.submission;
  if (!SUBMITTABLE_FROM_STATUSES.includes(submission.status)) return { error: LOCKED, success: false };

  const result = await saveEntry(
    { submissionId: submission.id, status: submission.status, templateId: link.cycle.templateId },
    values,
    submit,
    {
      actorId: null,
      savedAction: "submission.values_saved_via_link",
      submittedAction: "submission.submitted_via_link",
      submitComment: `Submitted through the emailed link sent to ${link.email}.`,
      meta: { via: "form_link", linkId: link.id, email: link.email },
    }
  );
  if (result.success) {
    await db.reportFormLink.update({ where: { id: link.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  }
  return result;
}
