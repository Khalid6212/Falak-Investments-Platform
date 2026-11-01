import "server-only";
import type { SubmissionStatus, Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { requireCompanyMembership, requireFalakRole } from "@/lib/auth/authorization";
import { InvalidTransitionError } from "@/lib/reporting/submission-errors";
import { writeAuditEvent } from "@/lib/audit/write-audit-event";
import { SUBMITTABLE_FROM_STATUSES } from "@/lib/reporting/submission-status";
import { fetchSubmissionMetricFields } from "@/lib/reporting/metrics";
import type { SubmissionDTO } from "@/lib/reporting/dto";

// SUBMITTABLE_FROM_STATUSES lives in its own file (submission-status.ts)
// so metrics.ts can import the same constant without a circular
// dependency (metrics.ts needs the constant; this file needs metrics.ts's
// fetchSubmissionMetricFields). The /submit page's "open for editing"
// hint (MyCompaniesClient) mirrors this same set.

interface SubmissionRow {
  id: string;
  status: SubmissionStatus;
  cycle: {
    companyId: string;
    templateId: string;
    periodLabel: string;
    periodStart: Date;
    periodEnd: Date;
    currentDeadline: Date;
  };
}

const SUBMISSION_SELECT = {
  id: true,
  status: true,
  cycle: {
    select: {
      companyId: true,
      templateId: true,
      periodLabel: true,
      periodStart: true,
      periodEnd: true,
      currentDeadline: true,
    },
  },
} as const;

/**
 * Derived strictly from the existing schema's own required-vs-optional
 * expressiveness: MetricDefinition.required + .isActive (scoped to the
 * submission's own ReportingTemplate via its cycle), and whether a
 * SubmissionMetricValue row exists for this exact submission with either
 * isNa=true, a non-null numericValue, or a non-null textValue that isn't
 * empty/whitespace-only after trimming (an empty or blank string is not
 * a real answer). Nothing here is invented -- these are exactly the
 * fields the schema already provides for this purpose. Used identically
 * for the UI-hint computation
 * (getCurrentSubmissionForCompanyMember) and the real enforcement check
 * inside the submit transaction, so the two can never disagree.
 */
async function checkMetricCompleteness(
  client: Prisma.TransactionClient | typeof db,
  submissionId: string,
  templateId: string
): Promise<{ hasApplicableMetrics: boolean; requiredMetricsComplete: boolean }> {
  const applicableDefinitions = await client.metricDefinition.findMany({
    where: { templateId, isActive: true },
    select: { id: true, required: true },
  });

  if (applicableDefinitions.length === 0) {
    return { hasApplicableMetrics: false, requiredMetricsComplete: false };
  }

  const requiredDefinitionIds = applicableDefinitions.filter((d) => d.required).map((d) => d.id);
  if (requiredDefinitionIds.length === 0) {
    return { hasApplicableMetrics: true, requiredMetricsComplete: true };
  }

  const values = await client.submissionMetricValue.findMany({
    where: { submissionId, metricDefinitionId: { in: requiredDefinitionIds } },
    select: { metricDefinitionId: true, isNa: true, numericValue: true, textValue: true },
  });

  const satisfiedDefinitionIds = new Set(
    values
      .filter((v) => v.isNa || v.numericValue !== null || (v.textValue !== null && v.textValue.trim().length > 0))
      .map((v) => v.metricDefinitionId)
  );

  const requiredMetricsComplete = requiredDefinitionIds.every((id) => satisfiedDefinitionIds.has(id));
  return { hasApplicableMetrics: true, requiredMetricsComplete };
}

/**
 * The required metrics still unanswered in this company's submission, so a
 * rejected submit can point at exactly those fields. Company members only.
 */
export async function getMissingRequiredMetricIds(companyId: string, submissionId: string): Promise<string[]> {
  await requireCompanyMembership(companyId, "MEMBER");
  const submission = await db.companySubmission.findFirst({
    where: { id: submissionId, cycle: { companyId } },
    select: { cycle: { select: { templateId: true } } },
  });
  if (!submission) return [];
  const required = await db.metricDefinition.findMany({
    where: { templateId: submission.cycle.templateId, isActive: true, required: true },
    select: { id: true },
  });
  const answered = await db.submissionMetricValue.findMany({
    where: { submissionId, metricDefinitionId: { in: required.map((d) => d.id) } },
    select: { metricDefinitionId: true, isNa: true, numericValue: true, textValue: true },
  });
  const done = new Set(
    answered
      .filter((v) => v.isNa || v.numericValue !== null || (v.textValue !== null && v.textValue.trim().length > 0))
      .map((v) => v.metricDefinitionId)
  );
  return required.map((d) => d.id).filter((id) => !done.has(id));
}

function toSubmissionDTO(
  row: SubmissionRow,
  completeness: { hasApplicableMetrics: boolean; requiredMetricsComplete: boolean },
  metrics: SubmissionDTO["metrics"]
): SubmissionDTO {
  const canSubmit =
    SUBMITTABLE_FROM_STATUSES.includes(row.status) && completeness.hasApplicableMetrics && completeness.requiredMetricsComplete;

  return {
    id: row.id,
    companyId: row.cycle.companyId,
    status: row.status,
    periodLabel: row.cycle.periodLabel,
    periodStart: row.cycle.periodStart,
    periodEnd: row.cycle.periodEnd,
    currentDeadline: row.cycle.currentDeadline,
    hasApplicableMetrics: completeness.hasApplicableMetrics,
    requiredMetricsComplete: completeness.requiredMetricsComplete,
    canSubmit,
    metrics,
  };
}

/**
 * The one CompanySubmission a currently-authorized company member should
 * see as "their current report" -- the most recently opened reporting
 * cycle's submission, if any. Requires MEMBER-or-above CompanyMembership
 * on `companyId` (re-verified fresh here, never trusted from any earlier
 * page-render decision), and the company itself not archived (enforced
 * inside requireCompanyMembership's own query). Returns null on no
 * active cycle, not an error -- an empty state, not a denial.
 */
export async function getCurrentSubmissionForCompanyMember(companyId: string): Promise<SubmissionDTO | null> {
  await requireCompanyMembership(companyId, "MEMBER");

  const submission = await db.companySubmission.findFirst({
    where: { cycle: { companyId, archivedAt: null } },
    orderBy: { cycle: { periodStart: "desc" } },
    select: SUBMISSION_SELECT,
  });

  if (!submission) return null;

  const completeness = await checkMetricCompleteness(db, submission.id, submission.cycle.templateId);
  const metrics = await fetchSubmissionMetricFields(db, submission.id, submission.cycle.templateId);
  return toSubmissionDTO(submission, completeness, metrics);
}

/**
 * Atomically transitions a CompanySubmission to `submitted`. Two
 * independent guarantees, both enforced fresh inside this one
 * transaction, never trusting anything read earlier by the caller/page/
 * client:
 *
 * 1. Completeness: at least one active MetricDefinition must apply to
 *    this submission's template, and every active, required one must
 *    have a valid SubmissionMetricValue -- checked BEFORE attempting any
 *    write, so an incomplete report never reaches the database as
 *    `submitted`, regardless of what a completeness flag/count/id the
 *    client might have sent.
 *
 * 2. Atomic conditional transition: the actual status flip is a single
 *    `updateMany` whose WHERE clause pins the EXACT status value just
 *    observed (not merely "one of the submittable statuses"), the exact
 *    authorized companyId (via the cycle relation), and the related
 *    company's archivedAt IS NULL (also via a relation filter) -- all in
 *    the same query. Requiring `count === 1` means: if the row's status
 *    changed to ANYTHING else between the read and this write (by a
 *    concurrent submit, a reviewer action, anything), the update matches
 *    zero rows and fails safely. Pinning the exact observed status (not
 *    just "in the allowed set") also makes the fromStatus recorded on
 *    the SubmissionWorkflowEvent provably accurate: a successful
 *    `count === 1` proves the row still had exactly that status at the
 *    moment of the write.
 *
 * The workflow-event row is created only after that conditional update
 * succeeds; if the event insert fails for any reason, the whole
 * transaction -- including the status update -- rolls back. The event
 * table's own `@@unique([submissionId, versionNo])` constraint remains
 * as defense in depth, not as the primary concurrency control (that's
 * the conditional `updateMany` above).
 */
export async function submitCompanySubmission(companyId: string, submissionId: string): Promise<SubmissionDTO> {
  const { user } = await requireCompanyMembership(companyId, "MEMBER");

  return db.$transaction(async (tx) => {
    // Read-only: locates the submission (scoped to the just-authorized
    // company) and captures its current status/template. This does NOT
    // authorize the write below -- the conditional updateMany re-verifies
    // everything itself, independently, and would fail safely even if
    // this read were somehow stale.
    const submission = await tx.companySubmission.findFirst({
      where: { id: submissionId, cycle: { companyId, archivedAt: null } },
      select: SUBMISSION_SELECT,
    });

    if (!submission) {
      throw new InvalidTransitionError();
    }
    if (!SUBMITTABLE_FROM_STATUSES.includes(submission.status)) {
      throw new InvalidTransitionError();
    }

    const completeness = await checkMetricCompleteness(tx, submission.id, submission.cycle.templateId);
    if (!completeness.hasApplicableMetrics || !completeness.requiredMetricsComplete) {
      throw new InvalidTransitionError();
    }

    const claim = await tx.companySubmission.updateMany({
      where: {
        id: submissionId,
        cycle: { companyId, archivedAt: null, company: { archivedAt: null } },
        status: submission.status,
      },
      data: { status: "submitted", submittedById: user.id },
    });

    if (claim.count !== 1) {
      throw new InvalidTransitionError();
    }

    const priorEventCount = await tx.submissionWorkflowEvent.count({ where: { submissionId } });

    await tx.submissionWorkflowEvent.create({
      data: {
        submissionId,
        versionNo: priorEventCount + 1,
        actorId: user.id,
        fromStatus: submission.status,
        toStatus: "submitted",
      },
    });

    await writeAuditEvent(tx, {
      actorId: user.id,
      action: "submission.submitted",
      targetType: "CompanySubmission",
      targetId: submissionId,
    });

    const metrics = await fetchSubmissionMetricFields(tx, submission.id, submission.cycle.templateId);
    return toSubmissionDTO(
      { ...submission, status: "submitted" },
      { hasApplicableMetrics: true, requiredMetricsComplete: true },
      metrics
    );
  });
}

/**
 * Falak-staff read path: every submission past the draft stage, across
 * the whole portfolio, for Falak Operations/Admin only. Not wired to any
 * UI in this slice -- included to satisfy this step's requirement that
 * Falak portfolio access go through requireFalakRole(), and exercised by
 * the focused tests, ahead of a future reporting-review UI step.
 */
export async function listSubmissionsForFalakReview(): Promise<SubmissionDTO[]> {
  await requireFalakRole("FALAK_OPERATIONS");

  const submissions = await db.companySubmission.findMany({
    where: { status: { not: "draft" }, cycle: { archivedAt: null } },
    orderBy: { cycle: { periodStart: "desc" } },
    select: SUBMISSION_SELECT,
  });

  return Promise.all(
    submissions.map(async (s) => {
      const completeness = await checkMetricCompleteness(db, s.id, s.cycle.templateId);
      const metrics = await fetchSubmissionMetricFields(db, s.id, s.cycle.templateId);
      return toSubmissionDTO(s, completeness, metrics);
    })
  );
}
