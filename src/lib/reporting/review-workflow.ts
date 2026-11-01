import "server-only";
import { db } from "@/lib/db";
import type { Prisma, SubmissionStatus } from "@/generated/prisma/client";
import { requireFalakRoleWithDepartmentScope } from "@/lib/auth/department-scope";
import { InvalidTransitionError } from "@/lib/reporting/submission-errors";
import { writeAuditEvent } from "@/lib/audit/write-audit-event";

/**
 * Reads a fresh event-version count and appends the next workflow event --
 * the same versioning approach submitCompanySubmission uses. Must be
 * called inside the same transaction as the conditional status claim that
 * preceded it, after that claim has already succeeded (count === 1).
 */
async function appendWorkflowEvent(
  tx: Prisma.TransactionClient,
  args: { submissionId: string; actorId: string; fromStatus: SubmissionStatus; toStatus: SubmissionStatus }
) {
  const priorEventCount = await tx.submissionWorkflowEvent.count({ where: { submissionId: args.submissionId } });
  await tx.submissionWorkflowEvent.create({
    data: {
      submissionId: args.submissionId,
      versionNo: priorEventCount + 1,
      actorId: args.actorId,
      fromStatus: args.fromStatus,
      toStatus: args.toStatus,
    },
  });
}

/**
 * submitted -> under_review. Reviewing is Operations' day-to-day job, so
 * this (and every other action in this file) requires only
 * FALAK_OPERATIONS -- FALAK_ADMIN also satisfies it via
 * requireFalakRole's existing superset semantics.
 *
 * The exact prior status (`submitted`) is pinned directly in the
 * conditional updateMany's WHERE, not read-then-pinned like
 * submitCompanySubmission -- unlike that function (which legitimately
 * accepts two different prior statuses), this action has exactly one
 * valid entry point, so there's nothing to "read" first: a row not
 * currently `submitted` simply isn't a match, and the claim safely fails
 * with count 0.
 */
export async function startReview(submissionId: string): Promise<void> {
  const { user, departments } = await requireFalakRoleWithDepartmentScope("FALAK_OPERATIONS");
  const departmentWhere = departments ? { department: { in: departments } } : {};

  await db.$transaction(async (tx) => {
    const claim = await tx.companySubmission.updateMany({
      where: { id: submissionId, status: "submitted", cycle: { archivedAt: null, company: { archivedAt: null, ...departmentWhere } } },
      data: { status: "under_review" },
    });
    if (claim.count !== 1) {
      throw new InvalidTransitionError();
    }

    await appendWorkflowEvent(tx, {
      submissionId,
      actorId: user.id,
      fromStatus: "submitted",
      toStatus: "under_review",
    });

    await writeAuditEvent(tx, {
      actorId: user.id,
      action: "submission.review_started",
      targetType: "CompanySubmission",
      targetId: submissionId,
    });
  });
}

/**
 * under_review -> changes_requested, with a real, resolvable ReviewComment
 * (targetType SUBMISSION) -- not just a note on the workflow event, per
 * the schema's own intent for that table. Created in the same transaction
 * as the status claim: if the comment insert fails for any reason, the
 * whole transaction -- including the status change -- rolls back, the
 * same atomicity discipline as submitCompanySubmission's event creation.
 */
export async function requestChanges(submissionId: string, comment: string): Promise<void> {
  const { user, departments } = await requireFalakRoleWithDepartmentScope("FALAK_OPERATIONS");
  const departmentWhere = departments ? { department: { in: departments } } : {};

  await db.$transaction(async (tx) => {
    const claim = await tx.companySubmission.updateMany({
      where: { id: submissionId, status: "under_review", cycle: { archivedAt: null, company: { archivedAt: null, ...departmentWhere } } },
      data: { status: "changes_requested" },
    });
    if (claim.count !== 1) {
      throw new InvalidTransitionError();
    }

    await appendWorkflowEvent(tx, {
      submissionId,
      actorId: user.id,
      fromStatus: "under_review",
      toStatus: "changes_requested",
    });

    await tx.reviewComment.create({
      data: {
        targetType: "SUBMISSION",
        submissionId,
        body: comment,
        authorId: user.id,
        status: "Open",
      },
    });

    await writeAuditEvent(tx, {
      actorId: user.id,
      action: "submission.changes_requested",
      targetType: "CompanySubmission",
      targetId: submissionId,
    });
  });
}

/**
 * under_review -> approved. Distinct action from publish (Step 11, once
 * Report/ReportVersion exist) -- this only ever moves a CompanySubmission,
 * never touches a Report.
 */
export async function approveSubmission(submissionId: string): Promise<void> {
  const { user, departments } = await requireFalakRoleWithDepartmentScope("FALAK_OPERATIONS");
  const departmentWhere = departments ? { department: { in: departments } } : {};

  await db.$transaction(async (tx) => {
    const claim = await tx.companySubmission.updateMany({
      where: { id: submissionId, status: "under_review", cycle: { archivedAt: null, company: { archivedAt: null, ...departmentWhere } } },
      data: { status: "approved" },
    });
    if (claim.count !== 1) {
      throw new InvalidTransitionError();
    }

    await appendWorkflowEvent(tx, {
      submissionId,
      actorId: user.id,
      fromStatus: "under_review",
      toStatus: "approved",
    });

    await writeAuditEvent(tx, {
      actorId: user.id,
      action: "submission.approved",
      targetType: "CompanySubmission",
      targetId: submissionId,
    });
  });
}
