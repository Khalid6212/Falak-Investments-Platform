// Node ESM loader hook, registered via `node --import ./tests/support/register.mjs`.
// Built entirely on Node's own module-customization API (node:module
// register/resolve/load hooks) -- no test framework, no new dependency.
//
// Its job: let plain `node --test` resolve this project's `@/*`
// TypeScript path alias (which only Next.js's own bundler normally
// understands), so the REAL, unmodified source files under src/ can be
// imported and executed directly in tests, with exactly five specifiers
// substituted:
//
//   - "server-only"              -> a no-op stub. This package is not
//                                    actually installed in node_modules at
//                                    all -- Next.js's bundler provides it
//                                    internally; outside that bundler it
//                                    has zero runtime behavior anyway, so
//                                    a no-op module is faithful, not a
//                                    behavior change.
//   - "@/lib/db"                 -> a synthetic module whose `db` export
//                                    is a Proxy that live-reads
//                                    globalThis.__TEST_DB_STUB__ on every
//                                    property access -- never a real
//                                    PrismaClient, never a live
//                                    connection, never Neon.
//   - "@/lib/auth/current-user"  -> a synthetic module whose
//                                    `getCurrentUser` forwards live to
//                                    globalThis.__TEST_GET_CURRENT_USER_STUB__.
//   - "@/lib/email/send-email"   -> a synthetic module whose
//                                    `sendSignInEmail` forwards live to
//                                    globalThis.__TEST_SEND_EMAIL_STUB__ --
//                                    the one real network I/O boundary for
//                                    outbound email, stubbed the same way
//                                    as the database so tests never call
//                                    the real Resend API.
//   - "next/navigation"          -> a synthetic module whose `redirect`
//                                    throws a MockRedirectError(url) --
//                                    next/navigation is only resolvable
//                                    inside Next's own bundler (the same
//                                    class of problem next/server posed
//                                    for src/auth.ts, worked around there
//                                    by extracting authorize-credentials.ts
//                                    into its own file). Faithful to the
//                                    real redirect()'s actual behavior:
//                                    it throws rather than returning, so a
//                                    caller's own try/catch still sees a
//                                    thrown control-flow signal, just a
//                                    test-visible one instead of Next's
//                                    internal NEXT_REDIRECT digest.
//
// Every other "@/..." specifier resolves to the real file on disk under
// src/ and is loaded completely unmodified -- including
// src/lib/auth/authorization.ts, src/lib/auth/authorization-errors.ts,
// src/lib/reporting/*.ts, and src/auth.ts's own non-mocked logic.
import { pathToFileURL } from "node:url";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../src");
const SRC_ROOT = PROJECT_ROOT.replace(/\\/g, "/");

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "server-only") {
    return { url: "mock:server-only", shortCircuit: true };
  }
  if (specifier === "@/lib/db") {
    return { url: "mock:db", shortCircuit: true };
  }
  if (specifier === "@/lib/auth/current-user") {
    return { url: "mock:current-user", shortCircuit: true };
  }
  if (specifier === "@/lib/email/send-email") {
    return { url: "mock:send-email", shortCircuit: true };
  }
  if (specifier === "@/lib/storage/blob") {
    return { url: "mock:storage-blob", shortCircuit: true };
  }
  if (specifier === "next/navigation") {
    return { url: "mock:next-navigation", shortCircuit: true };
  }
  if (specifier.startsWith("@/")) {
    const rewritten = pathToFileURL(`${SRC_ROOT}/${specifier.slice(2)}.ts`).href;
    return nextResolve(rewritten, context);
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url === "mock:server-only") {
    return { format: "module", shortCircuit: true, source: "export {};" };
  }
  if (url === "mock:db") {
    return {
      format: "module",
      shortCircuit: true,
      source: "export const db = new Proxy({}, { get: (_t, prop) => globalThis.__TEST_DB_STUB__[prop] });",
    };
  }
  if (url === "mock:current-user") {
    return {
      format: "module",
      shortCircuit: true,
      source: "export const getCurrentUser = (...args) => globalThis.__TEST_GET_CURRENT_USER_STUB__(...args);",
    };
  }
  if (url === "mock:send-email") {
    return {
      format: "module",
      shortCircuit: true,
      source:
        "export const sendSignInEmail = (...args) => globalThis.__TEST_SEND_EMAIL_STUB__(...args);\n" +
        "export const sendAccessApprovedEmail = (...args) => globalThis.__TEST_SEND_ACCESS_APPROVED_EMAIL_STUB__(...args);\n" +
        "export const sendDeadlineReminderEmail = (...args) => globalThis.__TEST_SEND_DEADLINE_REMINDER_EMAIL_STUB__(...args);\n" +
        "export const sendOverdueReminderEmail = (...args) => globalThis.__TEST_SEND_OVERDUE_REMINDER_EMAIL_STUB__(...args);\n" +
        "export const sendReportPublishedEmail = (...args) => globalThis.__TEST_SEND_REPORT_PUBLISHED_EMAIL_STUB__(...args);\n" +
        "export const sendPasswordResetEmail = (...args) => globalThis.__TEST_SEND_PASSWORD_RESET_EMAIL_STUB__(...args);\n" +
        "export const sendReportRequestEmail = (...args) => (globalThis.__TEST_SEND_REPORT_REQUEST_EMAIL_STUB__ ?? (async () => {}))(...args);\n" +
        "export const sendChangesRequestedEmail = (...args) => (globalThis.__TEST_SEND_CHANGES_REQUESTED_EMAIL_STUB__ ?? (async () => {}))(...args);",
    };
  }
  if (url === "mock:storage-blob") {
    return {
      format: "module",
      shortCircuit: true,
      source:
        "export const uploadAttachment = (...args) => globalThis.__TEST_UPLOAD_ATTACHMENT_STUB__(...args);\n" +
        "export const deleteAttachment = (...args) => globalThis.__TEST_DELETE_ATTACHMENT_STUB__(...args);\n" +
        "export const getAttachmentStream = (...args) => globalThis.__TEST_GET_ATTACHMENT_STREAM_STUB__(...args);",
    };
  }
  if (url === "mock:next-navigation") {
    return {
      format: "module",
      shortCircuit: true,
      source: `
        export class MockRedirectError extends Error {
          constructor(url) { super("NEXT_REDIRECT:" + url); this.digest = "NEXT_REDIRECT"; this.url = url; }
        }
        export function redirect(url) { throw new MockRedirectError(url); }
      `,
    };
  }
  return nextLoad(url, context);
}
