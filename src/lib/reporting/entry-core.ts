import "server-only";
import type { SubmissionStatus } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { writeAuditEvent } from "@/lib/audit/write-audit-event";
import { FIX_FIELDS_ERROR, invalidMetricFields, writeMetricValues, type MetricValueInput } from "@/lib/reporting/metrics";

// Saving a report's figures -- and optionally submitting it -- for anyone
// filling it in other than through the signed-in startup form: Falak staff
// (staff-entry.ts) and a startup using an emailed link (form-link.ts).
// Callers check who may do this and which statuses they may touch first.

export interface EntryResult {
  error: string | null;
  fieldErrors?: Record<string, string>;
  success: boolean;
  submitted?: boolean;
}

export interface EntryTarget {
  submissionId: string;
  /** The status just read; a submit is pinned to it. */
  status: SubmissionStatus;
  templateId: string;
}

export interface EntryAudit {
  /** User doing it, or null for someone using an emailed link. */
  actorId: string | null;
  savedAction: string;
  submittedAction: string;
  /** Recorded on the workflow event when submitting. */
  submitComment: string;
  meta?: Record<string, unknown>;
}

const GENERIC_ERROR = "Something went wrong. Check your input and try again.";

class MissingRequired extends Error {
  ids: string[];
  constructor(ids: string[]) {
    super("missing required");
    this.ids = ids;
  }
}

/**
 * Validates and saves the figures; with `submit`, also moves the report to
 * "submitted" once every required field is answered (or marked N/A).
 * Saving and submitting happen together or not at all.
 */
export async function saveEntry(target: EntryTarget, values: MetricValueInput[], submit: boolean, audit: EntryAudit): Promise<EntryResult> {
  // Only this template's own fields can be written.
  const definitions = await db.metricDefinition.findMany({
    where: { templateId: target.templateId, isActive: true },
    select: { id: true, dataType: true, required: true },
  });
  const definitionsById = new Map(definitions.map((d) => [d.id, d.dataType] as const));

  const fieldErrors = invalidMetricFields(values, definitionsById);
  if (Object.keys(fieldErrors).length > 0) {
    return { error: FIX_FIELDS_ERROR, fieldErrors, success: false };
  }

  try {
    await db.$transaction(async (tx) => {
      await writeMetricValues(tx, target.submissionId, values, definitionsById);
      await writeAuditEvent(tx, {
        actorId: audit.actorId,
        action: audit.savedAction,
        targetType: "CompanySubmission",
        targetId: target.submissionId,
        meta: audit.meta,
      });
      if (!submit) return;

      const required = definitions.filter((d) => d.required).map((d) => d.id);
      const answered = await tx.submissionMetricValue.findMany({
        where: { submissionId: target.submissionId, metricDefinitionId: { in: required } },
        select: { metricDefinitionId: true, isNa: true, numericValue: true, textValue: true },
      });
      const done = new Set(
        answered
          .filter((v) => v.isNa || v.numericValue !== null || (v.textValue !== null && v.textValue.trim().length > 0))
          .map((v) => v.metricDefinitionId)
      );
      const missing = required.filter((id) => !done.has(id));
      if (missing.length > 0) throw new MissingRequired(missing);

      // Pinned to the status just read, so a concurrent change fails safely.
      const claim = await tx.companySubmission.updateMany({
        where: { id: target.submissionId, status: target.status },
        data: { status: "submitted", submittedById: audit.actorId },
      });
      if (claim.count !== 1) throw new Error("status changed");
      const priorEventCount = await tx.submissionWorkflowEvent.count({ where: { submissionId: target.submissionId } });
      await tx.submissionWorkflowEvent.create({
        data: {
          submissionId: target.submissionId,
          versionNo: priorEventCount + 1,
          actorId: audit.actorId,
          fromStatus: target.status,
          toStatus: "submitted",
          comment: audit.submitComment,
        },
      });
      await writeAuditEvent(tx, {
        actorId: audit.actorId,
        action: audit.submittedAction,
        targetType: "CompanySubmission",
        targetId: target.submissionId,
        meta: audit.meta,
      });
    });
  } catch (error) {
    if (error instanceof MissingRequired) {
      return {
        error: `${error.ids.length} required field(s) are empty. Fill them in (or tick N/A) to submit. Nothing was saved.`,
        fieldErrors: Object.fromEntries(error.ids.map((id) => [`value_${id}`, "Required."])),
        success: false,
      };
    }
    console.error("Saving report figures failed:", error);
    return { error: GENERIC_ERROR, success: false };
  }

  return { error: null, success: true, submitted: submit };
}
