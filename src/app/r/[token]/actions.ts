"use server";

import { saveViaFormLink, uploadStatementViaFormLink, type StatementUploadResult } from "@/lib/reporting/form-link";
import type { EntryResult } from "@/lib/reporting/entry-core";
import type { MetricValueInput } from "@/lib/reporting/metrics";

/**
 * Saves (intent "save") or submits (intent "submit") a report through an
 * emailed link. No sign-in: the link's token is the only key, re-checked
 * on every call (valid, not expired, report still open for editing).
 * Inputs follow the startup form's naming: value_<id> and the na_<id> box.
 */
export async function formLinkAction(token: string, _prev: EntryResult, formData: FormData): Promise<EntryResult> {
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
  return saveViaFormLink(token, values, formData.get("intent") === "submit");
}

/** Uploads one financial statements file through the emailed link. */
export async function uploadStatementAction(token: string, _prev: StatementUploadResult, formData: FormData): Promise<StatementUploadResult> {
  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "Choose a file to upload.", success: false };
  return uploadStatementViaFormLink(token, file, formData.get("audited") === "on");
}
