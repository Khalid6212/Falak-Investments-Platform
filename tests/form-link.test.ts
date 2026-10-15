import { test } from "node:test";
import assert from "node:assert/strict";
import { setDbStub, makeAdminActionDbStub } from "./support/stubs.ts";

// Imports the REAL production module via tests/support/mock-loader.mjs.
const { saveViaFormLink, getFormLinkView, startupRecipients } = await import("../src/lib/reporting/form-link.ts");
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
  answered?: { metricDefinitionId: string; isNa: boolean; numericValue: string | null; textValue: string | null }[];
}

function makeStub(options: LinkOptions = {}) {
  const upserts: Record<string, unknown>[] = [];
  const statusUpdates: Record<string, unknown>[] = [];
  const linkUpdates: Record<string, unknown>[] = [];
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
  return { stub, upserts, statusUpdates, linkUpdates };
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
