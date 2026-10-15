import { test } from "node:test";
import assert from "node:assert/strict";
import { setDbStub, makeAdminActionDbStub } from "./support/stubs.ts";

// Imports the REAL production module via tests/support/mock-loader.mjs.
const { saveViaFormLink, getFormLinkView, startupRecipients, uploadStatementViaFormLink } = await import("../src/lib/reporting/form-link.ts");
const { hashInviteToken } = await import("../src/lib/auth/invite-token.ts");

const TOKEN = "a".repeat(64);
const DEFINITIONS = [
  { id: "m_revenue", dataType: "Currency", required: true },
  { id: "m_notes", dataType: "Text", required: false },
];
const REVENUE = { metricDefinitionId: "m_revenue", rawValue: "250,000", isNa: false };

interface LinkOptions {
  status?: string;
  expiresAt?: Date;
  revokedAt?: Date | null;
  archived?: boolean;
  statements?: boolean;
  answered?: { metricDefinitionId: string; isNa: boolean; numericValue: string | null; textValue: string | null }[];
}

function makeStub(options: LinkOptions = {}) {
  const upserts: Record<string, unknown>[] = [];
  const statusUpdates: Record<string, unknown>[] = [];
  const linkUpdates: Record<string, unknown>[] = [];
  const attachments: Record<string, unknown>[] = [];
  const stub = makeAdminActionDbStub({
    falakRoles: [],
    models: {
      reportFormLink: {
        findUnique: async ({ where }: { where: { tokenHash: string } }) =>
          where.tokenHash !== hashInviteToken(TOKEN)
            ? null
            : {
                id: "fl_1",
                email: "founder@acme.com",
                expiresAt: options.expiresAt ?? new Date(Date.now() + 86_400_000),
                revokedAt: options.revokedAt ?? null,
                cycle: {
                  id: "cy_1",
                  templateId: "tpl_1",
                  periodLabel: "Q3 2026",
                  periodEnd: new Date("2026-09-30T00:00:00Z"),
                  template: { collectFinancialStatements: options.statements ?? false },
                  currentDeadline: new Date("2026-10-15T00:00:00Z"),
                  company: {
                    nameEn: "Acme",
                    nameAr: "أكمي",
                    currency: "SAR",
                    archivedAt: options.archived ? new Date() : null,
                    deletedAt: null,
                  },
                  submission: { id: "sub_1", status: options.status ?? "draft" },
                },
              },
        update: async (args: Record<string, unknown>) => {
          linkUpdates.push(args);
          return args;
        },
      },
      attachment: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          attachments.push(data);
          return { id: `att_${attachments.length}` };
        },
        findMany: async () => attachments.map((a) => ({ fileName: a.fileName, kind: a.kind })),
      },
      metricDefinition: { findMany: async () => DEFINITIONS },
      submissionMetricValue: {
        upsert: async ({ create }: { create: Record<string, unknown> }) => {
          upserts.push(create);
          return create;
        },
        findMany: async () => options.answered ?? [],
      },
      companySubmission: {
        updateMany: async (args: Record<string, unknown>) => {
          statusUpdates.push(args);
          return { count: 1 };
        },
      },
      submissionWorkflowEvent: {
        count: async () => 0,
        create: async ({ data }: { data: Record<string, unknown> }) => data,
      },
    },
  });
  return { stub, upserts, statusUpdates, linkUpdates, attachments };
}

test("form link: saves a draft's figures without submitting, audited as via the link", async () => {
  const { stub, upserts, statusUpdates, linkUpdates } = makeStub();
  setDbStub(stub);
  const result = await saveViaFormLink(TOKEN, [REVENUE], false);
  assert.deepEqual(result, { error: null, success: true, submitted: false });
  assert.equal(upserts.length, 1);
  assert.equal(statusUpdates.length, 0);
  assert.equal(linkUpdates.length, 1, "lastUsedAt is recorded");
  const audit = stub.getAuditEvents().find((e) => e.action === "submission.values_saved_via_link");
  assert.ok(audit);
  assert.equal(audit.actorUserId ?? null, null);
});

test("form link: submit moves a complete draft to submitted", async () => {
  const { stub, statusUpdates } = makeStub({
    answered: [{ metricDefinitionId: "m_revenue", isNa: false, numericValue: "250000", textValue: null }],
  });
  setDbStub(stub);
  const result = await saveViaFormLink(TOKEN, [REVENUE], true);
  assert.equal(result.submitted, true);
  assert.equal((statusUpdates[0].data as Record<string, unknown>).status, "submitted");
  assert.ok(stub.getAuditEvents().some((e) => e.action === "submission.submitted_via_link"));
});

test("form link: a report sent back with changes requested can be resubmitted", async () => {
  const { stub } = makeStub({
    status: "changes_requested",
    answered: [{ metricDefinitionId: "m_revenue", isNa: false, numericValue: "250000", textValue: null }],
  });
  setDbStub(stub);
  const result = await saveViaFormLink(TOKEN, [REVENUE], true);
  assert.equal(result.submitted, true);
});

test("form link: a submitted, in-review or approved report is locked", async () => {
  for (const status of ["submitted", "under_review", "approved"]) {
    const { stub, upserts } = makeStub({ status });
    setDbStub(stub);
    const result = await saveViaFormLink(TOKEN, [REVENUE], false);
    assert.equal(result.success, false, status);
    assert.equal(upserts.length, 0, status);
    const view = await getFormLinkView(TOKEN);
    assert.ok(view.ok && !view.editable, status);
  }
});

test("form link: unknown, malformed, expired, revoked and archived-startup links are refused", async () => {
  const cases: [string, LinkOptions, string][] = [
    ["unknown", {}, "b".repeat(64)],
    ["malformed", {}, "not-a-token"],
    ["expired", { expiresAt: new Date(Date.now() - 1000) }, TOKEN],
    ["revoked", { revokedAt: new Date() }, TOKEN],
    ["archived", { archived: true }, TOKEN],
  ];
  for (const [name, options, token] of cases) {
    const { stub, upserts } = makeStub(options);
    setDbStub(stub);
    const result = await saveViaFormLink(token, [REVENUE], true);
    assert.equal(result.success, false, name);
    assert.equal(upserts.length, 0, name);
    assert.deepEqual(await getFormLinkView(token), { ok: false }, name);
  }
});

test("recipients: active members plus the founder email, normalized and de-duplicated", () => {
  const emails = startupRecipients({
    founderEmail: " Founder@Acme.com ",
    memberships: [{ user: { email: "founder@acme.com" } }, { user: { email: "cfo@acme.com" } }],
  });
  assert.deepEqual(emails.sort(), ["cfo@acme.com", "founder@acme.com"]);
});

const uploads: { pathname: string }[] = [];
(globalThis as Record<string, unknown>).__TEST_UPLOAD_ATTACHMENT_STUB__ = async (pathname: string, body: Blob, contentType: string) => {
  uploads.push({ pathname });
  return { pathname: pathname + "-x1", size: body.size, contentType };
};
const pdf = (bytes = 2048, name = "FS 2025.pdf", type = "application/pdf") => new File([new Uint8Array(bytes)], name, { type });

test("statements: uploaded through the link onto the submission, never as a report file", async () => {
  uploads.length = 0;
  const { stub, attachments } = makeStub({ statements: true });
  setDbStub(stub);
  const result = await uploadStatementViaFormLink(TOKEN, pdf(), true);
  assert.deepEqual(result, { error: null, success: true });
  assert.equal(attachments.length, 1);
  assert.equal(attachments[0].ownerType, "SUBMISSION");
  assert.equal(attachments[0].kind, "AuditedFinancials");
  assert.equal(attachments[0].submissionId, "sub_1");
  assert.equal(attachments[0].reportVersionId, undefined);
  assert.equal(attachments[0].uploadedById, null);
  assert.ok(uploads[0].pathname.startsWith("submissions/sub_1/statements/"));
  assert.ok(stub.getAuditEvents().some((e) => e.action === "submission.statements_uploaded_via_link"));
  const view = await getFormLinkView(TOKEN);
  assert.ok(view.ok && view.collectStatements && view.statementsYear === 2025);
  assert.deepEqual(view.ok && view.statements, [{ fileName: "FS 2025.pdf", audited: true }]);
});

test("statements: refused when the template doesn't ask, the report is locked, or the file is too big or the wrong type", async () => {
  const cases: [string, LinkOptions, File][] = [
    ["not asked", { statements: false }, pdf()],
    ["locked", { statements: true, status: "submitted" }, pdf()],
    ["too big", { statements: true }, pdf(5 * 1024 * 1024)],
    ["wrong type", { statements: true }, pdf(100, "run.exe", "application/x-msdownload")],
    ["empty", { statements: true }, pdf(0)],
  ];
  for (const [name, options, file] of cases) {
    const { stub, attachments } = makeStub(options);
    setDbStub(stub);
    const result = await uploadStatementViaFormLink(TOKEN, file, false);
    assert.equal(result.success, false, name);
    assert.equal(attachments.length, 0, name);
  }
});
