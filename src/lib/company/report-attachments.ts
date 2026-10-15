import "server-only";
import { db } from "@/lib/db";
import { requireFalakRole } from "@/lib/auth/authorization";
import { uploadAttachment } from "@/lib/storage/blob";

const GENERIC_ERROR = "Something went wrong. Check your file and try again.";
// Uploads go through server actions; Vercel caps requests at 4.5 MB (see next.config.ts).
const MAX_FILE_SIZE_BYTES = 4 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "image/png",
  "image/jpeg",
]);

export interface UploadReportAttachmentResult {
  error: string | null;
  success: boolean;
}

/**
 * Falak-staff-only (same FALAK_OPERATIONS floor getQuarterlyReportData's
 * own staff branch uses) -- attaches a file (e.g. a polished PDF) to an
 * already-published ReportVersion, for investors to see in their
 * document vault. Never touches ReportAccessGrant/ReportDistribution --
 * visibility of the attachment follows the version's own existing
 * grants, nothing new to authorize.
 */
export async function uploadReportVersionAttachment(reportVersionId: string, file: File): Promise<UploadReportAttachmentResult> {
  const { user } = await requireFalakRole("FALAK_OPERATIONS");

  if (file.size === 0 || file.size > MAX_FILE_SIZE_BYTES) {
    return { error: GENERIC_ERROR, success: false };
  }
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return { error: GENERIC_ERROR, success: false };
  }

  const version = await db.reportVersion.findUnique({ where: { id: reportVersionId }, select: { id: true } });
  if (!version) {
    return { error: GENERIC_ERROR, success: false };
  }

  try {
    const uploaded = await uploadAttachment(`report-versions/${reportVersionId}/${file.name}`, file, file.type);
    await db.attachment.create({
      data: {
        ownerType: "REPORT_VERSION",
        reportVersionId,
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
