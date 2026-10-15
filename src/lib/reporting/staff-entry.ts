import "server-only";
import type { SubmissionStatus } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { requireFalakRoleWithDepartmentScope } from "@/lib/auth/department-scope";
import { ForbiddenError } from "@/lib/auth/authorization-errors";
import { writeAuditEvent } from "@/lib/audit/write-audit-event";
import { SUBMITTABLE_FROM_STATUSES } from "@/lib/reporting/submission-status";
import { fetchSubmissionMetricFields, type MetricValueInput } from "@/lib/reporting/metrics";
import { saveEntry, type EntryResult } from "@/lib/reporting/entry-core";
import type { SubmissionMetricFieldDTO } from "@/lib/reporting/dto";
import type { Currency } from "@/generated/prisma/client";

// Staff entering a startup's figures themselves -- e.g. numbers received by
// email or in a meeting -- into the same submission the startup would
// fill in, so they flow into the startup page and, once approved and
// published through Review, into the quarterly report.

/** Approved and published reports are a fixed record; never edited here. */
const STAFF_EDITABLE_STATUSES: SubmissionStatus[] = ["draft", "changes_requested", "submitted", "under_review"];

const GENERIC_ERROR = "Something went wrong. Check your input and try again.";
const LOCKED_ERROR = "This report has been approved or published, so its figures can no longer be changed here.";

export interface StaffEntryCycle {
  cycleId: string;
  submissionId: string;
  status: SubmissionStatus;
  editable: boolean;
  /** Draft / changes requested: staff can also submit it on the startup's behalf. */
  canSubmit: boolean;
  periodLabel: string;
  templateNameEn: string;
  templateNameAr: string;
  currentDeadline: string;
  company: { id: string; slug: string; nameEn: string; nameAr: string; currency: Currency };
  request: { templateId: string; periodStart: string; periodEnd: string };
  metrics: SubmissionMetricFieldDTO[];
}

function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

async function loadCycle(cycleId: string) {
  const { user, departments } = await requireFalakRoleWithDepartmentScope("FALAK_OPERATIONS");
  const cycle = await db.reportingCycle.findFirst({
    where: { id: cycleId, company: { archivedAt: null } },
    select: {
      id: true,
      templateId: true,
      periodLabel: true,
      periodStart: true,
      periodEnd: true,
      currentDeadline: true,
      template: { select: { nameEn: true, nameAr: true } },
      company: { select: { id: true, slug: true, nameEn: true, nameAr: true, currency: true, department: true } },
      submission: { select: { id: true, status: true } },
    },
  });
  if (!cycle) return null;
  if (departments && !departments.includes(cycle.company.department)) throw new ForbiddenError();
  return { user, cycle };
}

/** The cycle and its form fields, for the staff entry page. Null when it doesn't exist. */
export async function getStaffEntryCycle(cycleId: string): Promise<StaffEntryCycle | null> {
  const loaded = await loadCycle(cycleId);
  if (!loaded) return null;
  const { user, cycle } = loaded;

  // Every request is created with a draft submission; one made before that
  // rule gets its submission now.
  let submission = cycle.submission;
  if (!submission) {
    submission = await db.$transaction(async (tx) => {
      const created = await tx.companySubmission.create({ data: { cycleId: cycle.id, status: "draft" }, select: { id: true, status: true } });
      await writeAuditEvent(tx, { actorId: user.id, action: "submission.created_by_staff", targetType: "CompanySubmission", targetId: created.id });
      return created;
    });
  }

  return {
    cycleId: cycle.id,
    submissionId: submission.id,
    status: submission.status,
    editable: STAFF_EDITABLE_STATUSES.includes(submission.status),
    canSubmit: SUBMITTABLE_FROM_STATUSES.includes(submission.status),
    periodLabel: cycle.periodLabel,
    templateNameEn: cycle.template.nameEn,
    templateNameAr: cycle.template.nameAr,
    currentDeadline: toDateOnly(cycle.currentDeadline),
    company: {
      id: cycle.company.id,
      slug: cycle.company.slug,
      nameEn: cycle.company.nameEn,
      nameAr: cycle.company.nameAr,
      currency: cycle.company.currency,
    },
    request: { templateId: cycle.templateId, periodStart: toDateOnly(cycle.periodStart), periodEnd: toDateOnly(cycle.periodEnd) },
    metrics: await fetchSubmissionMetricFields(db, submission.id, cycle.templateId),
  };
}

export type StaffEntryResult = EntryResult;

/**
 * Saves staff-entered figures for a cycle; with `submit`, also submits the
 * report on the startup's behalf (draft / changes requested only), which
 * puts it in the Review queue for approval and publishing. Saving and
 * submitting happen together or not at all. Always audited.
 */
export async function staffSaveCycleValues(cycleId: string, values: MetricValueInput[], submit: boolean): Promise<StaffEntryResult> {
  const loaded = await loadCycle(cycleId);
  if (!loaded?.cycle.submission) return { error: GENERIC_ERROR, success: false };
  const { user, cycle } = loaded;
  const submission = cycle.submission!;
  if (!STAFF_EDITABLE_STATUSES.includes(submission.status)) return { error: LOCKED_ERROR, success: false };
  const submitNow = submit && SUBMITTABLE_FROM_STATUSES.includes(submission.status);

  return saveEntry(
    { submissionId: submission.id, status: submission.status, templateId: cycle.templateId },
    values,
    submitNow,
    {
      actorId: user.id,
      savedAction: "submission.values_entered_by_staff",
      submittedAction: "submission.submitted_by_staff",
      submitComment: "Figures entered and submitted by Falak staff on the startup's behalf.",
    }
  );
}
