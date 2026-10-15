import "server-only";
import { db } from "@/lib/db";
import { requireFalakRole } from "@/lib/auth/authorization";
import { uploadAttachment } from "@/lib/storage/blob";

const GENERIC_ERROR = "Something went wrong. Check your file and try again.";
// Uploads go through server actions; Vercel caps requests at 4.5 MB (see next.config.ts).
export const MAX_FILE_SIZE_BYTES = 4 * 1024 * 1024;
export const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/png",
  "image/jpeg",
]);

export interface UploadAttachmentResult {
  error: string | null;
  success: boolean;
}

/**
 * Falak-staff-only (Admin or Operations -- "Management" and
 * "Investment Professional" in sign-up terms, see
 * src/app/admin/access/_components/ApproveRequestForm.tsx's own
 * mapping). Company members no longer have any attachment-upload path
 * of their own; a startup's supporting documents (financials, decks,
 * audited statements) are attached by Falak on the platform, through
 * this one function, on the Reports Review and Approval page. Not
 * gated by submission status -- Falak may need to attach something at
 * any point in the review lifecycle, not only while it's still
 * editable by the company.
 */
export async function adminUploadSubmissionAttachment(
  submissionId: string,
  file: File,
  isAuditedFinancials = false
): Promise<UploadAttachmentResult> {
  const { user } = await requireFalakRole("FALAK_OPERATIONS");

  const submission = await db.companySubmission.findFirst({
    where: { id: submissionId, cycle: { company: { archivedAt: null } } },
    select: { id: true },
  });
  if (!submission) {
    return { error: GENERIC_ERROR, success: false };
  }

  if (file.size === 0 || file.size > MAX_FILE_SIZE_BYTES) {
    return { error: GENERIC_ERROR, success: false };
  }
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return { error: GENERIC_ERROR, success: false };
  }

  try {
    const uploaded = await uploadAttachment(`submissions/${submissionId}/${file.name}`, file, file.type);
    await db.attachment.create({
      data: {
        ownerType: "SUBMISSION",
        kind: isAuditedFinancials ? "AuditedFinancials" : "General",
        submissionId,
        fileName: file.name,
        mimeType: file.type,
        sizeBytes: uploaded.size,
        storageProvider: "vercel-blob",
        storageKey: uploaded.pathname,
        uploadedById: user.id,
      },
    });
  } catch {
    return { error: GENERIC_ERROR, success: false };
  }

  return { error: null, success: true };
}

export interface SubmissionAttachmentDTO {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  isAuditedFinancials: boolean;
}

/**
 * No auth of its own -- every caller (the Reports Review and Approval
 * page) already verifies FALAK_OPERATIONS before reaching here, same
 * "auth happens once, at the real entry point" discipline as
 * fetchSubmissionMetricFields.
 */
export async function listSubmissionAttachments(submissionId: string): Promise<SubmissionAttachmentDTO[]> {
  const rows = await db.attachment.findMany({
    where: { submissionId, ownerType: "SUBMISSION" },
    orderBy: { createdAt: "desc" },
    select: { id: true, fileName: true, mimeType: true, sizeBytes: true, createdAt: true, kind: true },
  });
  return rows.map((r) => ({
    id: r.id,
    fileName: r.fileName,
    mimeType: r.mimeType,
    sizeBytes: r.sizeBytes,
    createdAt: r.createdAt.toISOString(),
    isAuditedFinancials: r.kind === "AuditedFinancials",
  }));
}
