import type { MetricDataType } from "@/generated/prisma/client";
import type { FieldErrors, FormValues } from "@/lib/admin/entity-validation";

// Validation for the New Reporting Template form, one message per bad
// field so only that field is highlighted.

const METRIC_DATA_TYPES: MetricDataType[] = ["Currency", "Percent", "Number", "Date", "Text", "Boolean"];
const MAX_NAME_LENGTH = 200;
const MAX_METRIC_ROWS = 40;

/**
 * Turns whatever was typed (or, when left empty, the English label) into
 * a valid metric key: "Revenue B2B" -> "revenue_b2b".
 */
export function toMetricKey(input: string): string {
  const key = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!key) return "";
  return /^[a-z]/.test(key) ? key : `m_${key}`;
}

export interface TemplateMetricInput {
  key: string;
  labelEn: string;
  labelAr: string;
  dataType: MetricDataType;
  sortOrder: number;
}

export interface ValidatedTemplate {
  values: FormValues;
  errors: FieldErrors;
  input: { nameEn: string; nameAr: string; metrics: TemplateMetricInput[] } | null;
}

function read(formData: FormData, field: string): string {
  const value = formData.get(field);
  return typeof value === "string" ? value.trim() : "";
}

const okName = (v: string) => v.length > 0 && v.length <= MAX_NAME_LENGTH;

export function validateNewTemplate(formData: FormData): ValidatedTemplate {
  const values: FormValues = {};
  for (const [k, v] of formData.entries()) if (typeof v === "string") values[k] = v;
  const errors: FieldErrors = {};

  const nameEn = read(formData, "nameEn");
  const nameAr = read(formData, "nameAr");
  if (!okName(nameEn)) errors.nameEn = "Required.";
  if (!okName(nameAr)) errors.nameAr = "Required.";

  const metrics: TemplateMetricInput[] = [];
  const seen = new Map<string, string>();
  for (let i = 0; i < MAX_METRIC_ROWS; i++) {
    const rawKey = read(formData, `metricKey_${i}`);
    const labelEn = read(formData, `metricLabelEn_${i}`);
    const labelAr = read(formData, `metricLabelAr_${i}`);
    const dataType = read(formData, `metricDataType_${i}`);
    // A completely empty row is simply unused.
    if (!rawKey && !labelEn && !labelAr && !dataType) continue;

    const key = toMetricKey(rawKey || labelEn);
    if (!okName(labelEn)) errors[`metricLabelEn_${i}`] = "Required.";
    if (!okName(labelAr)) errors[`metricLabelAr_${i}`] = "Required.";
    if (!METRIC_DATA_TYPES.includes(dataType as MetricDataType)) errors[`metricDataType_${i}`] = "Choose a data type.";
    if (!key) {
      errors[`metricKey_${i}`] = "Enter a key or an English label.";
    } else if (seen.has(key)) {
      errors[`metricKey_${i}`] = `Same key as another metric ("${key}"). Use a different key or label.`;
    } else {
      seen.set(key, `metricKey_${i}`);
    }
    metrics.push({ key, labelEn, labelAr, dataType: dataType as MetricDataType, sortOrder: metrics.length + 1 });
  }

  if (metrics.length === 0 && !errors.nameEn && !errors.nameAr) {
    errors.metricLabelEn_0 = "Add at least one metric.";
  }

  if (Object.keys(errors).length > 0) return { values, errors, input: null };
  return { values, errors, input: { nameEn, nameAr, metrics } };
}
