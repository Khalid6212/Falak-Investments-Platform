import { test } from "node:test";
import assert from "node:assert/strict";
import { setDbStub, makeRemindersDbStub, setSendDeadlineReminderEmailSpy, setSendOverdueReminderEmailSpy } from "./support/stubs.ts";

// Imports the REAL production module via tests/support/mock-loader.mjs.
const { sendDueReminders } = await import("../src/lib/reporting/reminders.ts");

const NOW = new Date("2026-06-15T12:00:00Z");
const envBefore = process.env.APP_BASE_URL;
process.env.APP_BASE_URL = "https://falakinvestments.space";
test.after(() => {
  process.env.APP_BASE_URL = envBefore;
});

test("deadline 3 days away sends an upcoming reminder", async () => {
  const upcoming = setSendDeadlineReminderEmailSpy();
  const overdue = setSendOverdueReminderEmailSpy();
  setDbStub(
    makeRemindersDbStub([
      {
        id: "cy_1",
        periodLabel: "Q2 2026",
        currentDeadline: new Date("2026-06-18T00:00:00Z"),
        companySlug: "acme",
        companyNameEn: "Acme",
        memberEmails: ["founder@acme.com"],
        submissionStatus: "draft",
      },
    ])
  );

  const results = await sendDueReminders(NOW);
  assert.equal(results.length, 1);
  assert.equal(results[0].kind, "upcoming");
  assert.equal(upcoming.length, 1);
  assert.equal(upcoming[0].to, "founder@acme.com");
  assert.equal(overdue.length, 0);
});

test("deadline already passed sends an overdue reminder, not an upcoming one", async () => {
  const upcoming = setSendDeadlineReminderEmailSpy();
  const overdue = setSendOverdueReminderEmailSpy();
  setDbStub(
    makeRemindersDbStub([
      {
        id: "cy_1",
        periodLabel: "Q1 2026",
        currentDeadline: new Date("2026-06-01T00:00:00Z"),
        companySlug: "acme",
        companyNameEn: "Acme",
        memberEmails: ["founder@acme.com"],
        submissionStatus: "draft",
      },
    ])
  );

  const results = await sendDueReminders(NOW);
  assert.equal(results.length, 1);
  assert.equal(results[0].kind, "overdue");
  assert.equal(overdue.length, 1);
  assert.equal(upcoming.length, 0);
});

test("deadline far in the future (outside the window) sends nothing", async () => {
  const upcoming = setSendDeadlineReminderEmailSpy();
  setDbStub(
    makeRemindersDbStub([
      {
        id: "cy_1",
        periodLabel: "Q3 2026",
        currentDeadline: new Date("2026-09-01T00:00:00Z"),
        companySlug: "acme",
        companyNameEn: "Acme",
        memberEmails: ["founder@acme.com"],
        submissionStatus: "draft",
      },
    ])
  );

  const results = await sendDueReminders(NOW);
  assert.equal(results.length, 0);
  assert.equal(upcoming.length, 0);
});

test("a reminder already sent within the cooldown window is not re-sent", async () => {
  const upcoming = setSendDeadlineReminderEmailSpy();
  setDbStub(
    makeRemindersDbStub([
      {
        id: "cy_1",
        periodLabel: "Q2 2026",
        currentDeadline: new Date("2026-06-18T00:00:00Z"),
        lastReminderSentAt: new Date("2026-06-15T06:00:00Z"),
        companySlug: "acme",
        companyNameEn: "Acme",
        memberEmails: ["founder@acme.com"],
        submissionStatus: "draft",
      },
    ])
  );

  const results = await sendDueReminders(NOW);
  assert.equal(results.length, 0, "sent 6 hours ago is within the 20h cooldown");
  assert.equal(upcoming.length, 0);
});

test("a reminder sent over a day ago is re-sent", async () => {
  const upcoming = setSendDeadlineReminderEmailSpy();
  setDbStub(
    makeRemindersDbStub([
      {
        id: "cy_1",
        periodLabel: "Q2 2026",
        currentDeadline: new Date("2026-06-18T00:00:00Z"),
        lastReminderSentAt: new Date("2026-06-14T06:00:00Z"),
        companySlug: "acme",
        companyNameEn: "Acme",
        memberEmails: ["founder@acme.com"],
        submissionStatus: "draft",
      },
    ])
  );

  const results = await sendDueReminders(NOW);
  assert.equal(results.length, 1);
  assert.equal(upcoming.length, 1);
});

test("a cycle already submitted is never reminded", async () => {
  const upcoming = setSendDeadlineReminderEmailSpy();
  setDbStub(
    makeRemindersDbStub([
      {
        id: "cy_1",
        periodLabel: "Q2 2026",
        currentDeadline: new Date("2026-06-18T00:00:00Z"),
        companySlug: "acme",
        companyNameEn: "Acme",
        memberEmails: ["founder@acme.com"],
        submissionStatus: "submitted",
      },
    ])
  );

  const results = await sendDueReminders(NOW);
  assert.equal(results.length, 0);
  assert.equal(upcoming.length, 0);
});

test("a cycle with no company members at all sends nothing and is not marked reminded", async () => {
  setDbStub(
    makeRemindersDbStub([
      {
        id: "cy_1",
        periodLabel: "Q2 2026",
        currentDeadline: new Date("2026-06-18T00:00:00Z"),
        companySlug: "acme",
        companyNameEn: "Acme",
        memberEmails: [],
        submissionStatus: "draft",
      },
    ])
  );

  const results = await sendDueReminders(NOW);
  assert.equal(results.length, 0);
});

test("one email per active member of the company", async () => {
  const upcoming = setSendDeadlineReminderEmailSpy();
  setDbStub(
    makeRemindersDbStub([
      {
        id: "cy_1",
        periodLabel: "Q2 2026",
        currentDeadline: new Date("2026-06-18T00:00:00Z"),
        companySlug: "acme",
        companyNameEn: "Acme",
        memberEmails: ["a@acme.com", "b@acme.com"],
        submissionStatus: "draft",
      },
    ])
  );

  const results = await sendDueReminders(NOW);
  assert.equal(results[0].recipientCount, 2);
  assert.equal(upcoming.length, 2);
});

test("the founder email gets a reminder without an account, each recipient with their own link", async () => {
  const upcoming = setSendDeadlineReminderEmailSpy();
  const stub = makeRemindersDbStub([
    {
      id: "cy_1",
      periodLabel: "Q2 2026",
      currentDeadline: new Date("2026-06-18T00:00:00Z"),
      companySlug: "acme",
      companyNameEn: "Acme",
      memberEmails: ["a@acme.com"],
      founderEmail: "Founder@Acme.com",
      submissionStatus: "draft",
    },
  ]);
  setDbStub(stub);

  await sendDueReminders(NOW);
  assert.deepEqual(upcoming.map((e) => e.to).sort(), ["a@acme.com", "founder@acme.com"]);
  const links = stub.getFormLinks();
  assert.equal(links.length, 2);
  assert.ok(upcoming.every((e) => e.formUrl.startsWith("https://falakinvestments.space/r/")));
  assert.notEqual(upcoming[0].formUrl, upcoming[1].formUrl);
  assert.ok(links.every((l) => l.cycleId === "cy_1" && l.expiresAt > new Date()));
});
