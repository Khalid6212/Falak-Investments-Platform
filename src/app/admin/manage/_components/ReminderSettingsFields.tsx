"use client";

import { useState, type ReactNode } from "react";
import { Input } from "@/components/ui/Input";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { REMINDER_LIMITS, type ReminderSettings } from "@/lib/reporting/reminder-schedule";

/**
 * Deadline reminder settings, shared by the new-request form and a
 * request's page. Off unless ticked; the numbers show only when they apply.
 */
export function ReminderSettingsFields({
  initial,
  errorFor,
}: {
  initial: ReminderSettings;
  errorFor: (name: string) => ReactNode;
}) {
  const { t } = useLanguage();
  const m = t.admin.manage;
  const [enabled, setEnabled] = useState(initial.remindersEnabled);
  const [overdue, setOverdue] = useState(initial.overdueRemindersEnabled);

  const number = (name: keyof typeof REMINDER_LIMITS, label: string) => (
    <label className="inline-flex flex-wrap items-center gap-2 text-sm text-foreground">
      {label.split("{n}")[0]}
      <Input
        name={name}
        type="number"
        inputMode="numeric"
        min={REMINDER_LIMITS[name].min}
        max={REMINDER_LIMITS[name].max}
        step={1}
        defaultValue={initial[name]}
        aria-label={label.replace("{n}", "N")}
        className="w-20"
      />
      {label.split("{n}")[1]}
      {errorFor(name)}
    </label>
  );

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-xs font-medium text-muted-foreground">{m.remindersTitle}</legend>
      <label className="inline-flex items-center gap-2 text-sm text-foreground">
        <input type="checkbox" name="remindersEnabled" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        {m.remindersEnabledLabel}
      </label>
      {/* Hidden rather than removed, so switching off keeps the numbers. */}
      <div className={enabled ? "flex flex-col gap-2 ps-6" : "hidden"}>
          {number("reminderStartDays", m.reminderStartDaysLabel)}
          {number("reminderEveryDays", m.reminderEveryDaysLabel)}
          <label className="inline-flex items-center gap-2 text-sm text-foreground">
            <input type="checkbox" name="overdueRemindersEnabled" checked={overdue} onChange={(e) => setOverdue(e.target.checked)} />
            {m.overdueRemindersLabel}
          </label>
          <div className={overdue ? "flex flex-col gap-2 ps-6" : "hidden"}>
            {number("overdueEveryDays", m.overdueEveryDaysLabel)}
            {number("overdueForDays", m.overdueForDaysLabel)}
          </div>
      </div>
      {enabled ? null : <p className="text-xs text-muted-foreground">{m.remindersOffNote}</p>}
    </fieldset>
  );
}
