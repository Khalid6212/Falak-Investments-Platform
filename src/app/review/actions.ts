"use server";

import { db } from "@/lib/db";
import { requireFalakRole } from "@/lib/auth/authorization";
import { writeAuditEvent } from "@/lib/audit/write-audit-event";
import { startReview, requestChanges, approveSubmission } from "@/lib/reporting/review-workflow";
import {
  publishSubmission,
  sendPublishNotifications,
  resendReportToInvestors,
  type NarrativeInputs,
} from "@/lib/reporting/publish-workflow";
import { adminUpdateSubmissionMetricValues, fetchSubmissionMetricFields, type MetricValueInput } from "@/lib/reporting/metrics";
import {
  adminUploadSubmissionAttachment,
  listSubmissionAttachments,
  type SubmissionAttachmentDTO,
} from "@/lib/reporting/attachments";
import { InvalidTransitionError } from "@/lib/reporting/submission-errors";
import { notifyChangesRequested } from "@/lib/reporting/report-request-notify";
import { isAuthError, GENERIC_ACCESS_DENIED } from "@/lib/auth/action-error";
import type { NarrativeKind } from "@/generated/prisma/client";
import type { SubmissionMetricFieldDTO } from "@/lib/reporting/dto";

export interface ReviewActionState {
  error: string | null;
  fieldErrors?: Record<string, string>;
  success?: boolean;
  notice?: string;
}

export interface SaveMetricsActionState {
  error: string | null;
  fieldErrors?: Record<string, string>;
  success: boolean;
}

const GENERIC_ERROR = "That action isn't available for this submission right now.";
const MAX_COMMENT_LENGTH = 4000;
const MAX_NARRATIVE_LENGTH = 8000;
const NARRATIVE_KINDS: NarrativeKind[] = [
  "operational_update",
  "quarter_highlights",
  "investment_review_notes",
  "management_commentary",
];

function readSubmissionId(formData: FormData): string | null {
  const value = formData.get("submissionId");
  return typeof value === "string" && value.length > 0 ? value : null;
}

export async function startReviewAction(_prevState: ReviewActionState, formData: FormData): Promise<ReviewActionState> {
  const submissionId = readSubmissionId(formData);
  if (!submissionId) {
    return { error: GENERIC_ERROR };
  }

  try {
    await startReview(submissionId);
  } catch (error) {
    if (isAuthError(error)) {
      return { error: GENERIC_ACCESS_DENIED };
    }
    if (error instanceof InvalidTransitionError) {
      return { error: GENERIC_ERROR };
    }
    throw error;
  }

  return { error: null };
}

export async function requestChangesAction(_prevState: ReviewActionState, formData: FormData): Promise<ReviewActionState> {
  const submissionId = readSubmissionId(formData);
  const commentInput = formData.get("comment");

  if (!submissionId || typeof commentInput !== "string") {
    return { error: GENERIC_ERROR };
  }
  // Reject oversized raw input before it's stored -- same discipline as
  // every other free-text field in this codebase.
  if (commentInput.length > MAX_COMMENT_LENGTH) {
    const message = `Comment is too long (up to ${MAX_COMMENT_LENGTH} characters).`;
    return { error: message, fieldErrors: { comment: message } };
  }
  const comment = commentInput.trim();
  if (!comment) {
    const message = "Explain what needs to change before sending this back.";
    return { error: message, fieldErrors: { comment: message } };
  }

  let actorId: string;
  try {
    await requestChanges(submissionId, comment);
    ({ user: { id: actorId } } = await requireFalakRole("FALAK_OPERATIONS"));
  } catch (error) {
    if (isAuthError(error)) {
      return { error: GENERIC_ACCESS_DENIED };
    }
    if (error instanceof InvalidTransitionError) {
      return { error: GENERIC_ERROR };
    }
    throw error;
  }

  // The startup gets the comment and a fresh link to the form, now open
  // for editing again. The change request stands even if the email fails.
  const emailed = await notifyChangesRequested(submissionId, comment, actorId);
  return { error: null, success: true, notice: emailed ? undefined : "Changes requested, but no email could be sent to the startup (no contact on file or delivery failed)." };
}

export async function approveSubmissionAction(_prevState: ReviewActionState, formData: FormData): Promise<ReviewActionState> {
  const submissionId = readSubmissionId(formData);
  if (!submissionId) {
    return { error: GENERIC_ERROR };
  }

  try {
    await approveSubmission(submissionId);
  } catch (error) {
    if (isAuthError(error)) {
      return { error: GENERIC_ACCESS_DENIED };
    }
    if (error instanceof InvalidTransitionError) {
      return { error: GENERIC_ERROR };
    }
    throw error;
  }

  return { error: null };
}

export async function publishSubmissionAction(_prevState: ReviewActionState, formData: FormData): Promise<ReviewActionState> {
  const submissionId = readSubmissionId(formData);
  if (!submissionId) {
    return { error: GENERIC_ERROR };
  }

  const narratives: NarrativeInputs = {};
  const fieldErrors: Record<string, string> = {};
  for (const kind of NARRATIVE_KINDS) {
    const enInput = formData.get(`${kind}En`);
    const arInput = formData.get(`${kind}Ar`);
    const textEn = typeof enInput === "string" ? enInput : "";
    const textAr = typeof arInput === "string" ? arInput : "";
    // Reject oversized raw input before it's stored -- same discipline as
    // every other free-text field in this codebase.
    const tooLong = `Too long (up to ${MAX_NARRATIVE_LENGTH} characters).`;
    if (textEn.length > MAX_NARRATIVE_LENGTH) fieldErrors[`${kind}En`] = tooLong;
    if (textAr.length > MAX_NARRATIVE_LENGTH) fieldErrors[`${kind}Ar`] = tooLong;
    narratives[kind] = { textEn, textAr };
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { error: "Fix the highlighted fields and try again.", fieldErrors };
  }

  let result;
  try {
    result = await publishSubmission(submissionId, narratives);
  } catch (error) {
    if (isAuthError(error)) {
      return { error: GENERIC_ACCESS_DENIED };
    }
    if (error instanceof InvalidTransitionError) {
      return { error: GENERIC_ERROR };
    }
    throw error;
  }

  // Deliberately outside the try/catch above -- the publish itself already
  // succeeded by this point, and sendPublishNotifications never throws
  // (per-recipient failures are recorded on their own ReportDistribution
  // row instead), so there is nothing here for this action to report as
  // an error.
  await sendPublishNotifications(result);

  return { error: null };
}

/**
 * Read-only -- called directly (not via a <form>) from
 * ReviewActionPanel's own effect whenever the selected submission
 * changes, the same "a 'use server' export is callable as a plain
 * async function, not only form-bound" capability Next.js Server
 * Actions support. Falak-staff-only; an unknown/archived-company
 * submissionId resolves to an empty list rather than throwing, so a
 * stale selection never surfaces a raw error to the panel.
 */
export async function getSubmissionMetricsForReviewAction(submissionId: string): Promise<SubmissionMetricFieldDTO[]> {
  await requireFalakRole("FALAK_OPERATIONS");

  const submission = await db.companySubmission.findFirst({
    where: { id: submissionId, cycle: { company: { archivedAt: null } } },
    select: { id: true, cycle: { select: { templateId: true } } },
  });
  if (!submission) return [];

  return fetchSubmissionMetricFields(db, submission.id, submission.cycle.templateId);
}

export async function adminUpdateSubmissionMetricValuesAction(
  _prevState: SaveMetricsActionState,
  formData: FormData
): Promise<SaveMetricsActionState> {
  const submissionId = readSubmissionId(formData);
  if (!submissionId) {
    return { error: GENERIC_ERROR, success: false };
  }

  const values: MetricValueInput[] = [];
  for (const key of formData.keys()) {
    if (!key.startsWith("value_")) continue;
    const metricDefinitionId = key.slice("value_".length);
    const rawValue = formData.get(key);
    values.push({
      metricDefinitionId,
      rawValue: typeof rawValue === "string" ? rawValue : "",
      isNa: formData.get(`na_${metricDefinitionId}`) !== null,
    });
  }

  try {
    const result = await adminUpdateSubmissionMetricValues(submissionId, values);
    if (!result.success) {
      return { error: result.error, fieldErrors: result.fieldErrors, success: false };
    }
  } catch (error) {
    if (isAuthError(error)) {
      return { error: GENERIC_ACCESS_DENIED, success: false };
    }
    throw error;
  }

  return { error: null, success: true };
}

/**
 * Edits an EXISTING reporting cycle's deadline -- the Reports Log's
 * "Edit Deadline" action, writing a real
 * ReportingCycleDeadlineExtension row (the model existed but had no
 * writer anywhere in this codebase until now) rather than silently
 * overwriting currentDeadline with no history.
 */
export async function extendReportingCycleDeadlineAction(
  _prevState: ReviewActionState,
  formData: FormData
): Promise<ReviewActionState> {
  let user;
  try {
    ({ user } = await requireFalakRole("FALAK_ADMIN"));
  } catch (error) {
    if (isAuthError(error)) {
      return { error: GENERIC_ACCESS_DENIED };
    }
    throw error;
  }

  const cycleId = formData.get("cycleId");
  const newDeadlineRaw = formData.get("newDeadline");
  if (typeof cycleId !== "string" || !cycleId) {
    return { error: GENERIC_ERROR };
  }
  const newDeadline = typeof newDeadlineRaw === "string" && newDeadlineRaw ? new Date(newDeadlineRaw) : null;
  if (!newDeadline || Number.isNaN(newDeadline.getTime())) {
    return { error: "Enter a valid date.", fieldErrors: { newDeadline: "Enter a valid date." } };
  }

  try {
    await db.$transaction(async (tx) => {
      const cycle = await tx.reportingCycle.findUnique({ where: { id: cycleId }, select: { currentDeadline: true } });
      if (!cycle) throw new InvalidTransitionError();
      // Saving the date that's already set changes nothing -- no history row.
      if (cycle.currentDeadline.getTime() === newDeadline.getTime()) return;

      await tx.reportingCycleDeadlineExtension.create({
        data: { cycleId, previousDeadline: cycle.currentDeadline, newDeadline, extendedById: user.id },
      });
      await tx.reportingCycle.update({ where: { id: cycleId }, data: { currentDeadline: newDeadline } });
      await writeAuditEvent(tx, {
        actorId: user.id,
        action: "reporting_cycle.deadline_extended",
        targetType: "ReportingCycle",
        targetId: cycleId,
      });
    });
  } catch (error) {
    if (error instanceof InvalidTransitionError) {
      return { error: GENERIC_ERROR };
    }
    return { error: GENERIC_ERROR };
  }

  return { error: null, success: true };
}

/**
 * Manually re-triggers investor distribution for an already-published
 * report version -- covers a failed original send or an investor who
 * gained exposure (joined a vehicle, or a new direct stake) after that
 * publish. Publishing itself still auto-sends on the first publish;
 * this is the explicit "do it again, right now" control on top of
 * that, requested separately from publish.
 */
export async function resendReportToInvestorsAction(
  _prevState: ReviewActionState,
  formData: FormData
): Promise<ReviewActionState> {
  const reportVersionId = formData.get("reportVersionId");
  if (typeof reportVersionId !== "string" || !reportVersionId) {
    return { error: GENERIC_ERROR };
  }

  try {
    await resendReportToInvestors(reportVersionId);
  } catch (error) {
    if (isAuthError(error)) {
      return { error: GENERIC_ACCESS_DENIED };
    }
    if (error instanceof InvalidTransitionError) {
      return { error: GENERIC_ERROR };
    }
    throw error;
  }

  return { error: null };
}

/**
 * Read-only, called directly (not via a <form>) from
 * ReviewActionPanel's own effect, same pattern as
 * getSubmissionMetricsForReviewAction above.
 */
/**
 * The written sections of this submission's currently published report,
 * if any. The publish form starts from these, so republishing keeps the
 * existing text unless it is edited. Admin-only, like publishing.
 */
export async function getPublishedNarrativesForReviewAction(
  submissionId: string
): Promise<{ kind: NarrativeKind; textEn: string; textAr: string }[]> {
  await requireFalakRole("FALAK_ADMIN");
  const submission = await db.companySubmission.findUnique({
    where: { id: submissionId },
    select: { cycle: { select: { companyId: true, periodStart: true, periodEnd: true } } },
  });
  if (!submission) return [];
  const { companyId, periodStart, periodEnd } = submission.cycle;
  const version = await db.reportVersion.findFirst({
    where: { isSuperseded: false, report: { scope: "COMPANY", companyId, periodStart, periodEnd } },
    select: { narratives: { select: { kind: true, textEn: true, textAr: true } } },
  });
  return version?.narratives ?? [];
}

export async function getSubmissionAttachmentsForReviewAction(submissionId: string): Promise<SubmissionAttachmentDTO[]> {
  await requireFalakRole("FALAK_OPERATIONS");
  return listSubmissionAttachments(submissionId);
}

export async function adminUploadAttachmentAction(
  _prevState: SaveMetricsActionState,
  formData: FormData
): Promise<SaveMetricsActionState> {
  const submissionId = readSubmissionId(formData);
  const file = formData.get("file");
  if (!submissionId) return { error: GENERIC_ERROR, success: false };
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a file to upload.", fieldErrors: { file: "Choose a file to upload." }, success: false };
  }
  const isAuditedFinancials = formData.get("isAuditedFinancials") === "on";

  try {
    const result = await adminUploadSubmissionAttachment(submissionId, file, isAuditedFinancials);
    if (!result.success) {
      return { error: result.error, fieldErrors: result.error ? { file: result.error } : undefined, success: false };
    }
  } catch (error) {
    if (isAuthError(error)) {
      return { error: GENERIC_ACCESS_DENIED, success: false };
    }
    throw error;
  }

  return { error: null, success: true };
}
