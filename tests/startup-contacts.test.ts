import { test } from "node:test";
import assert from "node:assert/strict";
import { setCurrentUser, setDbStub, makeAdminActionDbStub, REAL_USER } from "./support/stubs.ts";

const { startupRecipients, startupCc } = await import("../src/lib/reporting/form-link.ts");
const { saveStartupContacts } = await import("../src/lib/admin/startup-contacts.ts");

const NO_MEMBERS = { founderEmail: "founder@acme.com", memberships: [] };

test("recipients: To contacts get the email, Cc contacts are copied, 'Don't email' gets nothing", () => {
  const company = {
    ...NO_MEMBERS,
    contacts: [
      { email: "CEO@acme.com", delivery: "TO" as const },
      { email: "cfo@acme.com", delivery: "TO" as const },
      { email: "board@acme.com", delivery: "CC" as const },
      { email: "intern@acme.com", delivery: "NONE" as const },
    ],
  };
  const to = startupRecipients(company);
  assert.deepEqual(to, ["ceo@acme.com", "cfo@acme.com"]);
  assert.deepEqual(startupCc(company, to), ["board@acme.com"]);
});

test("recipients: once a startup has contacts, the founder email on its details is not used", () => {
  assert.deepEqual(startupRecipients({ ...NO_MEMBERS, contacts: [{ email: "cc@acme.com", delivery: "CC" as const }] }), []);
});

test("recipients: a startup with no contacts falls back to its founder email and users", () => {
  assert.deepEqual(startupRecipients({ ...NO_MEMBERS, memberships: [{ user: { email: "user@acme.com" } }], contacts: [] }).sort(), [
    "founder@acme.com",
    "user@acme.com",
  ]);
});

function contactsStub(options: { department?: string; existing?: string[] } = {}) {
  const updates: { where: { id: string }; data: Record<string, unknown> }[] = [];
  const created: Record<string, unknown>[] = [];
  const stub = makeAdminActionDbStub({
    falakRoles: [{ role: "FALAK_ADMIN" }],
    models: {
      company: {
        findUnique: async () => ({
          department: options.department ?? "InvestmentDepartment",
          archivedAt: null,
          contacts: (options.existing ?? ["sc_1", "sc_2"]).map((id) => ({ id })),
        }),
      },
      startupContact: {
        update: async (args: { where: { id: string }; data: Record<string, unknown> }) => {
          updates.push(args);
          return {};
        },
        createMany: async ({ data }: { data: Record<string, unknown>[] }) => {
          created.push(...data);
          return { count: data.length };
        },
      },
    },
  });
  return { stub, updates, created };
}

const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
};

test("contacts: edits, removes and adds in one save, with roles and To/Cc", async () => {
  setCurrentUser(REAL_USER);
  const { stub, updates, created } = contactsStub();
  setDbStub(stub);
  const result = await saveStartupContacts(
    form({
      companyId: "co_1",
      name_sc_1: "Sara Ali",
      email_sc_1: "Sara@Acme.com",
      role_sc_1: "CEO",
      delivery_sc_1: "TO",
      remove_sc_2: "on",
      newName_0: "Omar",
      newEmail_0: "omar@acme.com",
      newRole_0: "CFO",
      newDelivery_0: "CC",
    })
  );
  assert.deepEqual(result, { error: null, success: true });
  assert.deepEqual(updates[0], { where: { id: "sc_1" }, data: { name: "Sara Ali", email: "sara@acme.com", role: "CEO", delivery: "TO", sortOrder: 0 } });
  assert.equal(updates[1].where.id, "sc_2");
  assert.ok(updates[1].data.deletedAt instanceof Date);
  assert.deepEqual(created, [{ name: "Omar", email: "omar@acme.com", role: "CFO", delivery: "CC", sortOrder: 1, companyId: "co_1" }]);
  assert.ok(stub.getAuditEvents().some((e) => e.action === "company.contacts_updated"));
});

test("contacts: bad or repeated emails and missing names are highlighted and nothing is saved", async () => {
  setCurrentUser(REAL_USER);
  const { stub, updates, created } = contactsStub({ existing: ["sc_1"] });
  setDbStub(stub);
  const result = await saveStartupContacts(
    form({
      companyId: "co_1",
      name_sc_1: "",
      email_sc_1: "sara@acme.com",
      delivery_sc_1: "TO",
      newName_0: "Dup",
      newEmail_0: "SARA@acme.com",
      newName_1: "Bad",
      newEmail_1: "not-an-email",
    })
  );
  assert.equal(result.success, undefined);
  assert.ok(result.fieldErrors?.sc_1_name);
  assert.match(result.fieldErrors?.new0_email ?? "", /already in the list/);
  assert.ok(result.fieldErrors?.new1_email);
  assert.equal(updates.length + created.length, 0);
});
