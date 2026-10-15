import "server-only";
import { db } from "@/lib/db";

export type RequestEmailKind = "request" | "invite" | "reminder_upcoming" | "reminder_overdue" | "changes_requested";

export interface RequestEmailLogEntry {
  cycleId: string;
  recipientEmail: string;
  kind: RequestEmailKind;
  status: "sent" | "failed";
  failureReason?: string | null;
  sentById?: string | null;
}

/**
 * Records emails sent about reporting requests. Best-effort: the email has
 * already gone (or failed) by the time this runs, so a logging problem is
 * reported to the server log and never turned into a failed request.
 */
export async function logRequestEmails(entries: RequestEmailLogEntry[]): Promise<void> {
  if (entries.length === 0) return;
  try {
    await db.reportRequestEmail.createMany({
      data: entries.map((e) => ({
        cycleId: e.cycleId,
        recipientEmail: e.recipientEmail,
        kind: e.kind,
        status: e.status,
        failureReason: e.failureReason ? e.failureReason.slice(0, 500) : null,
        sentById: e.sentById ?? null,
      })),
    });
  } catch (error) {
    console.error("Could not record report request emails:", error);
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
