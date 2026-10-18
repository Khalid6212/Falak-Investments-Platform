// When a reporting cycle's next deadline reminder is due. Pure, so the
// rules can be tested with a fixed date. Whole days in UTC: the daily job
// runs once a day and deadlines are dates.

export interface ReminderSettings {
  remindersEnabled: boolean;
  reminderStartDays: number;
  reminderEveryDays: number;
  overdueRemindersEnabled: boolean;
  overdueEveryDays: number;
  overdueForDays: number;
}

export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = {
  remindersEnabled: false,
  reminderStartDays: 7,
  reminderEveryDays: 2,
  overdueRemindersEnabled: false,
  overdueEveryDays: 3,
  overdueForDays: 14,
};

/** Bounds for each number, also used by the settings forms. */
export const REMINDER_LIMITS = {
  reminderStartDays: { min: 0, max: 60 },
  reminderEveryDays: { min: 1, max: 30 },
  overdueEveryDays: { min: 1, max: 30 },
  overdueForDays: { min: 1, max: 90 },
} as const;

const DAY_MS = 24 * 60 * 60 * 1000;
const dayNumber = (d: Date) => Math.floor(d.getTime() / DAY_MS);

/**
 * "upcoming" from reminderStartDays before the deadline up to the deadline
 * day itself, every reminderEveryDays; "overdue" from the day after the
 * deadline, every overdueEveryDays, for overdueForDays -- only when switched
 * on. The first reminder of each kind goes out as soon as its window opens.
 */
export function reminderDue(
  settings: ReminderSettings,
  deadline: Date,
  lastReminder: { at: Date | null; kind: string | null },
  now: Date
): "upcoming" | "overdue" | null {
  if (!settings.remindersEnabled) return null;
  const today = dayNumber(now);
  const daysUntil = dayNumber(deadline) - today;
  const daysSinceLast = lastReminder.at ? today - dayNumber(lastReminder.at) : null;
  // Once per day at most, whatever the settings.
  if (daysSinceLast !== null && daysSinceLast < 1) return null;

  if (daysUntil >= 0) {
    if (daysUntil > settings.reminderStartDays) return null;
    const first = lastReminder.kind !== "upcoming" || daysSinceLast === null;
    return first || daysSinceLast >= settings.reminderEveryDays ? "upcoming" : null;
  }

  if (!settings.overdueRemindersEnabled || -daysUntil > settings.overdueForDays) return null;
  const first = lastReminder.kind !== "overdue" || daysSinceLast === null;
  return first || daysSinceLast >= settings.overdueEveryDays ? "overdue" : null;
}
