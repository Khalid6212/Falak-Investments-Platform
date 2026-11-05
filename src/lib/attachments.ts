import "server-only";
import { db } from "@/lib/db";
import { requireCurrentUser, requireFalakRole, requireCompanyMembership } from "@/lib/auth/authorization";
import { ForbiddenError } from "@/lib/auth/authorization-errors";

export interface AccessibleAttachment {
  id: string;
  fileName: string;
  mimeType: string;
  storageKey: string;
}

/**
 * Re-derives access fresh for one specific Attachment, never trusting a
 * page's own rendering decision -- same discipline as every other
 * resource-scoped read in this codebase. Returns null for BOTH an
 * unknown attachment id AND a real one this user isn't entitled to,
 * collapsed the same way getQuarterlyReportData collapses "unknown
 * period" and "unauthorized" -- never revealing which case it was.
 *
 * - SUBMISSION-owned: Falak staff, or a member of the submission's own
 *   company (same requireCompanyMembership gate StartupReportForm's own
 *   data already goes through).
 * - REPORT_VERSION-owned: Falak staff, or an investor holding a
 *   non-revoked ReportAccessGrant on that exact version (same check
 *   getQuarterlyReportData already makes).
 */
export async function getAccessibleAttachment(attachmentId: string): Promise<AccessibleAttachment | null> {
  const user = await requireCurrentUser();

  const attachment = await db.attachment.findUnique({
    where: { id: attachmentId },
    select: {
      id: true,
      fileName: true,
      mimeType: true,
      storageKey: true,
      ownerType: true,
      submission: { select: { cycle: { select: { companyId: true } } } },
      reportVersion: { select: { id: true } },
    },
  });
  if (!attachment) return null;

  const result: AccessibleAttachment = {
    id: attachment.id,
    fileName: attachment.fileName,
    mimeType: attachment.mimeType,
    storageKey: attachment.storageKey,
  };

  let isFalakStaff = false;
  try {
    await requireFalakRole("FALAK_OPERATIONS");
    isFalakStaff = true;
  } catch (error) {
    if (!(error instanceof ForbiddenError)) throw error;
  }
  if (isFalakStaff) return result;

  if (attachment.ownerType === "SUBMISSION" && attachment.submission) {
    try {
      await requireCompanyMembership(attachment.submission.cycle.companyId, "MEMBER");
      return result;
    } catch (error) {
      if (!(error instanceof ForbiddenError)) throw error;
      return null;
    }
  }

  if (attachment.ownerType === "REPORT_VERSION" && attachment.reportVersion) {
    const investorIds = (
      await db.investorMembership.findMany({
        where: { userId: user.id, revokedAt: null, investor: { archivedAt: null } },
        select: { investorId: true },
      })
    ).map((m) => m.investorId);
    if (investorIds.length === 0) return null;

    const grant = await db.reportAccessGrant.findFirst({
      where: {
        reportVersionId: attachment.reportVersion.id,
        investorId: { in: investorIds },
        revokedAt: null,
        // Not once the report's reporting cycle is archived or deleted.
        reportVersion: { submissions: { some: { submission: { cycle: { archivedAt: null } } } } },
      },
      select: { id: true },
    });
    return grant ? result : null;
  }

  return null;
}
