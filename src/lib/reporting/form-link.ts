import "server-only";
import { randomBytes } from "node:crypto";
import type { Currency, Department, Prisma, SubmissionStatus } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { hashInviteToken } from "@/lib/auth/invite-token";
import { normalizeEmail } from "@/lib/auth/utils";
import { SUBMITTABLE_FROM_STATUSES } from "@/lib/reporting/submission-status";
import { fetchSubmissionMetricFields, type MetricValueInput } from "@/lib/reporting/metrics";
import { saveEntry, type EntryResult } from "@/lib/reporting/entry-core";
import { ALLOWED_MIME_TYPES, MAX_FILE_SIZE_BYTES } from "@/lib/reporting/attachments";
import { uploadAttachment } from "@/lib/storage/blob";
import { writeAuditEvent } from "@/lib/audit/write-audit-event";
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
  department: true,
  memberships: {
    where: { revokedAt: null, user: { deactivatedAt: null } },
    select: { user: { select: { email: true } } },
  },
} as const;

/**
 * Investment Professionals (FALAK_OPERATIONS) in the startup's department,
 * copied on its report emails. Leaves out anyone already a recipient.
 * Best-effort: a lookup failure means no Cc, never a failed send.
 */
export async function investmentProfessionalCc(department: Department, recipients: string[]): Promise<string[]> {
  try {
    const users = await db.user.findMany({
      where: { department, deactivatedAt: null, roles: { some: { role: "FALAK_OPERATIONS", revokedAt: null } } },
      select: { email: true },
    });
    const skip = new Set(recipients);
    return [...new Set(users.map((u) => normalizeEmail(u.email)))].filter((e) => !skip.has(e));
  } catch (error) {
    console.error("Could not look up investment professionals to Cc:", error);
    return [];
  }
}

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
      /** This cycle asks for financial statements (set per request). */
      collectStatements: boolean;
      /** The year asked for; only meaningful when collectStatements. */
      statementsYear: number;
      /** Files sent through the emailed links (names only; Falak downloads them). */
      statements: { fileName: string; audited: boolean }[];
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
          statementsYear: true,
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
    collectStatements: cycle.statementsYear !== null,
    statementsYear: cycle.statementsYear ?? 0,
    statements: cycle.statementsYear !== null
      ? (
          await db.attachment.findMany({
            where: { submissionId: submission.id, ownerType: "SUBMISSION", uploadedById: null },
            orderBy: { createdAt: "asc" },
            select: { fileName: true, kind: true },
          })
        ).map((a) => ({ fileName: a.fileName, audited: a.kind === "AuditedFinancials" }))
      : [],
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

export interface StatementUploadResult {
  error: string | null;
  success: boolean;
}

/**
 * Uploads a financial statements file through a link, while the report is
 * open for the startup and its template asks for statements. Stored on the
 * submission -- visible to Falak (and the startup's own users), never to
 * investors, who only ever see files attached to a published report.
 */
export async function uploadStatementViaFormLink(rawToken: string, file: File, audited: boolean): Promise<StatementUploadResult> {
  const link = await findLink(rawToken);
  if (!link?.cycle.submission || link.cycle.statementsYear === null) return { error: INVALID_LINK, success: false };
  const submission = link.cycle.submission;
  if (!SUBMITTABLE_FROM_STATUSES.includes(submission.status)) return { error: LOCKED, success: false };
  if (file.size === 0) return { error: "Choose a file to upload.", success: false };
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return { error: "The file is over 4 MB. Please upload a smaller copy, or email it to info@falak.sa.", success: false };
  }
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return { error: "Upload a PDF, Excel, Word or image (PNG/JPG) file.", success: false };
  }
  const fileName = file.name.replace(/[\\/]/g, "_").slice(0, 200) || "statements";

  try {
    const uploaded = await uploadAttachment(`submissions/${submission.id}/statements/${fileName}`, file, file.type);
    await db.$transaction(async (tx) => {
      const attachment = await tx.attachment.create({
        data: {
          ownerType: "SUBMISSION",
          kind: audited ? "AuditedFinancials" : "General",
          submissionId: submission.id,
          fileName,
          mimeType: file.type,
          sizeBytes: uploaded.size,
          storageProvider: "vercel-blob",
          storageKey: uploaded.pathname,
          uploadedById: null,
        },
        select: { id: true },
      });
      await writeAuditEvent(tx, {
        actorId: null,
        action: "submission.statements_uploaded_via_link",
        targetType: "CompanySubmission",
        targetId: submission.id,
        meta: { via: "form_link", linkId: link.id, email: link.email, attachmentId: attachment.id, fileName, audited },
      });
    });
  } catch (error) {
    console.error("Statement upload via link failed:", error);
    return { error: "The file could not be uploaded. Please try again.", success: false };
  }
  await db.reportFormLink.update({ where: { id: link.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  return { error: null, success: true };
}
