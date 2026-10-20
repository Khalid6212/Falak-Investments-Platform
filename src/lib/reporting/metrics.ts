import "server-only";
import type { Prisma, MetricDataType, SubmissionStatus } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { requireCompanyMembership, requireFalakRole } from "@/lib/auth/authorization";
import { SUBMITTABLE_FROM_STATUSES } from "@/lib/reporting/submission-status";
import { writeAuditEvent } from "@/lib/audit/write-audit-event";
import type { SubmissionMetricFieldDTO } from "@/lib/reporting/dto";

/**
 * Every active MetricDefinition for `templateId`, each paired with
 * whatever SubmissionMetricValue (if any) exists for `submissionId` --
 * shared by submissions.ts's getCurrentSubmissionForCompanyMember/
 * listSubmissionsForFalakReview (read path) and saveMetricValues below
 * (to know which fields are even valid to write to). No auth of its own
 * -- callers have already verified access to submissionId/templateId
 * before reaching here, same "auth happens once, at the real entry
 * point" discipline as checkMetricCompleteness in submissions.ts.
 */
export async function fetchSubmissionMetricFields(
  client: Prisma.TransactionClient | typeof db,
  submissionId: string,
  templateId: string
): Promise<SubmissionMetricFieldDTO[]> {
  const definitions = await client.metricDefinition.findMany({
    where: { templateId, isActive: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true, key: true, labelEn: true, labelAr: true, dataType: true, required: true, sortOrder: true },
  });

  const values = await client.submissionMetricValue.findMany({
    where: { submissionId, metricDefinitionId: { in: definitions.map((d) => d.id) } },
    select: { metricDefinitionId: true, numericValue: true, textValue: true, isNa: true },
  });
  const valueByDefinitionId = new Map(values.map((v) => [v.metricDefinitionId, v]));

  return definitions.map((d) => {
    const existing = valueByDefinitionId.get(d.id);
    const value =
      !existing || existing.isNa
        ? null
        : d.dataType === "Text" || d.dataType === "Boolean"
          ? existing.textValue
          : (existing.numericValue?.toNumber() ?? null)?.toString() ?? null;

    return {
      metricDefinitionId: d.id,
      key: d.key,
      labelEn: d.labelEn,
      labelAr: d.labelAr,
      dataType: d.dataType,
      required: d.required,
      sortOrder: d.sortOrder,
      value,
      isNa: existing?.isNa ?? false,
    };
  });
}

export interface MetricValueInput {
  metricDefinitionId: string;
  rawValue: string;
  isNa: boolean;
}

export interface SaveMetricValuesResult {
  error: string | null;
  // Per field, keyed by the form input name `value_<metricDefinitionId>`.
  fieldErrors?: Record<string, string>;
  success: boolean;
}

const GENERIC_ERROR = "Something went wrong. Check your input and try again.";
const LOCKED_ERROR = "This report can no longer be edited.";
const MAX_RAW_VALUE_LENGTH = 4000;
export const FIX_FIELDS_ERROR = "Fix the highlighted fields and try again. Nothing was saved.";

const INVALID_MESSAGE: Record<MetricDataType, string> = {
  Currency: "Enter a number, e.g. 250,000, 1250.50 or -40,000 (negative).",
  Number: "Enter a number, e.g. 1,200 or -15.",
  Percent: "Enter a percentage, e.g. 12.5 or -3.",
  Boolean: "Choose Yes or No.",
  Text: `Up to ${MAX_RAW_VALUE_LENGTH} characters.`,
};

/**
 * Every submitted value that can't be stored, keyed by its input name.
 * Checked before anything is written, so a save either stores everything
 * or nothing -- a bad value is never silently dropped.
 */
export function invalidMetricFields(values: MetricValueInput[], definitionsById: Map<string, MetricDataType>): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const field of values) {
    const dataType = definitionsById.get(field.metricDefinitionId);
    if (!dataType) continue;
    if (field.rawValue.length > MAX_RAW_VALUE_LENGTH || toStoredValue(field, dataType) === "invalid") {
      errors[`value_${field.metricDefinitionId}`] =
        field.rawValue.length > MAX_RAW_VALUE_LENGTH ? `Up to ${MAX_RAW_VALUE_LENGTH} characters.` : INVALID_MESSAGE[dataType];
    }
  }
  return errors;
}

/**
 * Re-verifies company membership AND that the submission is still in an
 * editable status (SUBMITTABLE_FROM_STATUSES -- the exact same set
 * submitCompanySubmission itself requires, imported not duplicated)
 * before writing anything. Never trusts the page's own rendering
 * decision -- same discipline as every other mutation in this codebase.
 * Each field is validated by its OWN dataType (never the client's
 * claim), then upserted by the (submissionId, metricDefinitionId)
 * unique key.
 */
export async function saveMetricValues(
  companyId: string,
  submissionId: string,
  values: MetricValueInput[]
): Promise<SaveMetricValuesResult> {
  // No audit event: this is a draft-value save, not a workflow
  // transition -- this codebase only audits real transitions
  // (submission.submitted, review decisions, ...), not every keystroke
  // of in-progress editing.
  await requireCompanyMembership(companyId, "MEMBER");

  const submission = await db.companySubmission.findFirst({
    where: { id: submissionId, cycle: { companyId, company: { archivedAt: null } } },
    select: { id: true, status: true },
  });
  if (!submission) {
    return { error: GENERIC_ERROR, success: false };
  }
  if (!SUBMITTABLE_FROM_STATUSES.includes(submission.status)) {
    return { error: LOCKED_ERROR, success: false };
  }

  // dataType is looked up fresh here, never trusted from the client --
  // same "re-derive, don't trust the form's own claim" discipline as
  // every other validation in this codebase.
  const definitionsById = new Map(
    (
      await db.metricDefinition.findMany({
        where: { id: { in: values.map((v) => v.metricDefinitionId) } },
        select: { id: true, dataType: true },
      })
    ).map((d) => [d.id, d.dataType] as const)
  );

  const fieldErrors = invalidMetricFields(values, definitionsById);
  if (Object.keys(fieldErrors).length > 0) {
    return { error: FIX_FIELDS_ERROR, fieldErrors, success: false };
  }

  try {
    await db.$transaction(async (tx) => {
      await writeMetricValues(tx, submissionId, values, definitionsById);
    });
  } catch {
    return { error: GENERIC_ERROR, success: false };
  }

  return { error: null, success: true };
}

/**
 * The actual per-field validate-and-upsert loop, shared by
 * saveMetricValues (company member, draft/changes_requested only) and
 * adminUpdateSubmissionMetricValues below (Falak admin, submitted/
 * under_review only) -- the two callers differ only in who's allowed to
 * call them and which statuses are editable, never in how a raw value
 * actually gets validated and stored.
 */
export async function writeMetricValues(
  tx: Prisma.TransactionClient,
  submissionId: string,
  values: MetricValueInput[],
  definitionsById: Map<string, MetricDataType>
): Promise<void> {
  for (const field of values) {
    // Never trust a metricDefinitionId the form didn't actually receive
    // from the server -- silently skipped, not an error, since a
    // stale/tampered field here changes nothing about the fields that
    // ARE valid.
    const dataType = definitionsById.get(field.metricDefinitionId);
    if (!dataType) continue;
    if (field.rawValue.length > MAX_RAW_VALUE_LENGTH) continue;

    const data = toStoredValue(field, dataType);
    if (data === "invalid") continue;

    await tx.submissionMetricValue.upsert({
      where: { submissionId_metricDefinitionId: { submissionId, metricDefinitionId: field.metricDefinitionId } },
      update: data,
      create: { submissionId, metricDefinitionId: field.metricDefinitionId, ...data },
    });
  }
}

const ADMIN_EDITABLE_STATUSES: SubmissionStatus[] = ["submitted", "under_review"];

/**
 * Falak-admin counterpart to saveMetricValues -- lets staff correct a
 * company's reported values directly while a submission is under
 * review (submitted or under_review only; never draft/changes_requested,
 * which are the company's own editable window, and never approved/
 * published, which must stay an immutable historical record once
 * finalized). Always audited (unlike the company-member save path,
 * which is a draft-keystroke save, not a workflow transition) -- this
 * is Falak overwriting what the company itself reported, so it must
 * leave a trail.
 */
export async function adminUpdateSubmissionMetricValues(
  submissionId: string,
  values: MetricValueInput[]
): Promise<SaveMetricValuesResult> {
  const { user } = await requireFalakRole("FALAK_ADMIN");

  const submission = await db.companySubmission.findFirst({
    where: { id: submissionId, cycle: { company: { archivedAt: null } } },
    select: { id: true, status: true },
  });
  if (!submission) {
    return { error: GENERIC_ERROR, success: false };
  }
  if (!ADMIN_EDITABLE_STATUSES.includes(submission.status)) {
    return { error: LOCKED_ERROR, success: false };
  }

  const definitionsById = new Map(
    (
      await db.metricDefinition.findMany({
        where: { id: { in: values.map((v) => v.metricDefinitionId) } },
        select: { id: true, dataType: true },
      })
    ).map((d) => [d.id, d.dataType] as const)
  );

  const fieldErrors = invalidMetricFields(values, definitionsById);
  if (Object.keys(fieldErrors).length > 0) {
    return { error: FIX_FIELDS_ERROR, fieldErrors, success: false };
  }

  try {
    await db.$transaction(async (tx) => {
      await writeMetricValues(tx, submissionId, values, definitionsById);
      await writeAuditEvent(tx, {
        actorId: user.id,
        action: "submission.values_corrected_by_staff",
        targetType: "CompanySubmission",
        targetId: submissionId,
      });
    });
  } catch {
    return { error: GENERIC_ERROR, success: false };
  }

  return { error: null, success: true };
}

const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const EXTENDED_ARABIC_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

/**
 * A typed or pasted number as a plain decimal string ("-1250000.5"), or
 * null if it isn't one. Accepts thousands separators and spaces, "12.5%",
 * a currency sign or code (SAR, SR, USD, $, ﷼, ر.س), Arabic-Indic digits,
 * and negatives written any common way: -40,000, −40,000 (typographic
 * minus or dash, as pasted from Excel/Word/PDF), (40,000) accounting
 * style, or a trailing minus 40,000-.
 */
export function normaliseNumber(raw: string): string | null {
  let s = raw
    .replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String(EXTENDED_ARABIC_DIGITS.indexOf(d)))
    .replace(/٫/g, ".")
    .replace(/[٬,\s  ']/g, "")
    .replace(/[−‒–—﹣－]/g, "-")
    .replace(/(SAR|SR|USD|US\$|\$|﷼|ر\.?س\.?)/gi, "")
    .replace(/%$/, "");
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (s.endsWith("-")) {
    negative = !negative;
    s = s.slice(0, -1);
  }
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1);
  } else if (s.startsWith("+")) {
    s = s.slice(1);
  }
  if (!/^(\d+(\.\d+)?|\.\d+)$/.test(s)) return null;
  if (s.startsWith(".")) s = "0" + s;
  // Fits the column (Decimal(18, 4)): at most 14 digits before the point.
  if (s.split(".")[0].replace(/^0+(?=\d)/, "").length > 14) return null;
  const isZero = /^0+(\.0+)?$/.test(s);
  return negative && !isZero ? "-" + s : s;
}

interface StoredValueData {
  numericValue: string | null;
  textValue: string | null;
  isNa: boolean;
}

function toStoredValue(field: MetricValueInput, dataType: MetricDataType): StoredValueData | "invalid" {
  if (field.isNa) {
    return { numericValue: null, textValue: null, isNa: true };
  }

  const trimmed = field.rawValue.trim();
  if (trimmed.length === 0) {
    return { numericValue: null, textValue: null, isNa: false };
  }

  switch (dataType) {
    case "Currency":
    case "Percent":
    case "Number": {
      const normalised = normaliseNumber(trimmed);
      if (normalised === null) return "invalid";
      return { numericValue: normalised, textValue: null, isNa: false };
    }
    case "Boolean": {
      if (trimmed !== "Yes" && trimmed !== "No") return "invalid";
      return { numericValue: null, textValue: trimmed, isNa: false };
    }
    case "Text":
      return { numericValue: null, textValue: trimmed, isNa: false };
    default: {
      const exhaustiveCheck: never = dataType;
      throw new Error(`Unhandled MetricDataType: ${String(exhaustiveCheck)}`);
    }
  }
}
