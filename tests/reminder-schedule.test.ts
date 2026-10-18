import { test } from "node:test";
import assert from "node:assert/strict";
import { setDbStub, makeRemindersDbStub, setSendDeadlineReminderEmailSpy, setSendOverdueReminderEmailSpy } from "./support/stubs.ts";

const { reminderDue, DEFAULT_REMINDER_SETTINGS } = await import("../src/lib/reporting/reminder-schedule.ts");
const { sendDueReminders } = await import("../src/lib/reporting/reminders.ts");

const ON = { ...DEFAULT_REMINDER_SETTINGS, remindersEnabled: true }; // 7 days out, every 2 days, no overdue
const DEADLINE = new Date("2026-10-20T00:00:00Z");
const at = (iso: string) => new Date(`${iso}T08:00:00Z`);
const none = { at: null, kind: null };

test("reminder schedule: nothing unless switched on", () => {
  assert.equal(reminderDue(DEFAULT_REMINDER_SETTINGS, DEADLINE, none, at("2026-10-19")), null);
});

test("reminder schedule: starts N days out, repeats every M days, includes the deadline day", () => {
  assert.equal(reminderDue(ON, DEADLINE, none, at("2026-10-12")), null, "8 days out");
  assert.equal(reminderDue(ON, DEADLINE, none, at("2026-10-13")), "upcoming", "7 days out");
  const sent = (iso: string) => ({ at: at(iso), kind: "upcoming" });
  assert.equal(reminderDue(ON, DEADLINE, sent("2026-10-13"), at("2026-10-14")), null, "1 day later");
  assert.equal(reminderDue(ON, DEADLINE, sent("2026-10-13"), at("2026-10-15")), "upcoming", "2 days later");
  assert.equal(reminderDue(ON, DEADLINE, sent("2026-10-18"), at("2026-10-20")), "upcoming", "deadline day");
  assert.equal(reminderDue(ON, DEADLINE, sent("2026-10-20"), at("2026-10-20")), null, "never twice a day");
});

test("reminder schedule: the deadline day is not overdue; overdue only when switched on, every M days, for N days", () => {
  assert.equal(reminderDue(ON, DEADLINE, { at: at("2026-10-20"), kind: "upcoming" }, at("2026-10-21")), null, "overdue off");
  const overdue = { ...ON, overdueRemindersEnabled: true, overdueEveryDays: 3, overdueForDays: 7 };
  assert.equal(reminderDue(overdue, DEADLINE, { at: at("2026-10-18"), kind: "upcoming" }, at("2026-10-20")), "upcoming", "deadline day");
  assert.equal(reminderDue(overdue, DEADLINE, { at: at("2026-10-20"), kind: "upcoming" }, at("2026-10-21")), "overdue", "day after");
  assert.equal(reminderDue(overdue, DEADLINE, { at: at("2026-10-21"), kind: "overdue" }, at("2026-10-23")), null);
  assert.equal(reminderDue(overdue, DEADLINE, { at: at("2026-10-21"), kind: "overdue" }, at("2026-10-24")), "overdue");
  assert.equal(reminderDue(overdue, DEADLINE, { at: at("2026-10-24"), kind: "overdue" }, at("2026-10-28")), null, "8 days over: stopped");
});

test("reminder job: a cycle whose reminders were never switched on gets no email", async () => {
  process.env.APP_BASE_URL ??= "https://falakinvestments.space";
  const upcoming = setSendDeadlineReminderEmailSpy();
  const overdue = setSendOverdueReminderEmailSpy();
  setDbStub(
    makeRemindersDbStub([
      { id: "cy_off", periodLabel: "Q3 2026", currentDeadline: new Date("2026-10-19T00:00:00Z"), companySlug: "a", companyNameEn: "A", memberEmails: ["a@a.com"], submissionStatus: "draft", reminders: { remindersEnabled: false } },
      { id: "cy_late", periodLabel: "Q3 2026", currentDeadline: new Date("2026-10-10T00:00:00Z"), companySlug: "b", companyNameEn: "B", memberEmails: ["b@b.com"], submissionStatus: "draft", reminders: { remindersEnabled: false } },
    ])
  );
  assert.deepEqual(await sendDueReminders(at("2026-10-19")), []);
  assert.equal(upcoming.length + overdue.length, 0);
});
