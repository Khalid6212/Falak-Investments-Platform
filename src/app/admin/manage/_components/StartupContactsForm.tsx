"use client";

import { useState } from "react";
import { Trash2, X } from "lucide-react";
import { useForm } from "@/components/forms/useForm";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { saveStartupContactsAction } from "../../actions";
import { initialActionState, FormMessage } from "./shared";
import type { StartupContactDTO } from "@/lib/admin/startup-contacts";

// Matches MAX_NEW_CONTACT_ROWS in startup-contacts.ts.
const MAX_NEW_ROWS = 20;

/**
 * Who a startup's report emails go to: each contact's name, role, email and
 * whether they get the email (To, with their own form link), a copy (Cc),
 * or nothing. Editable at any time; requests, reminders and change requests
 * use the saved list.
 */
export function StartupContactsForm({ companyId, contacts }: { companyId: string; contacts: StartupContactDTO[] }) {
  const { t } = useLanguage();
  const m = t.admin.manage;
  const { state, isPending, errorFor, formProps } = useForm(saveStartupContactsAction, initialActionState, { resetOnSuccess: false });
  // A new list starts with one empty row ready to fill in.
  const [newRows, setNewRows] = useState<number[]>(contacts.length === 0 ? [0] : []);
  const [nextRow, setNextRow] = useState(contacts.length === 0 ? 1 : 0);
  const [removing, setRemoving] = useState<Set<string>>(new Set());
  const toggleRemove = (id: string) =>
    setRemoving((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const deliverySelect = (name: string, value: string, label: string) => (
    <Select name={name} defaultValue={value} aria-label={label}>
      <option value="TO">{m.contactDeliveryTo}</option>
      <option value="CC">{m.contactDeliveryCc}</option>
      <option value="NONE">{m.contactDeliveryNone}</option>
    </Select>
  );
  const grid = "grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_1.3fr_9rem_auto]";

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="font-heading text-sm font-semibold text-foreground">{m.contactsTitle}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{m.contactsHint}</p>
      </div>
      <form {...formProps} className="flex flex-col gap-3">
        <input type="hidden" name="companyId" value={companyId} />
        {contacts.length + newRows.length > 0 ? (
          <div className={`${grid} hidden text-xs font-medium text-muted-foreground sm:grid`}>
            <span>{m.contactNameLabel}</span>
            <span>{m.contactRoleLabel}</span>
            <span>{m.contactEmailLabel}</span>
            <span>{m.contactDeliveryLabel}</span>
            <span />
          </div>
        ) : null}

        {contacts.map((c) =>
          removing.has(c.id) ? (
            <div key={c.id} className="chamfer-br-sm flex flex-wrap items-center justify-between gap-2 bg-surface-muted p-2 shadow-[var(--inner-line)]">
              <input type="hidden" name={`remove_${c.id}`} value="on" />
              <p className="text-xs text-muted-foreground">{m.contactRemovePendingNote.replace("{name}", c.name)}</p>
              <Button type="button" variant="outline" size="xs" onClick={() => toggleRemove(c.id)}>
                {m.undoAction}
              </Button>
            </div>
          ) : (
            <div key={c.id} className={grid}>
              <div className="flex flex-col gap-1">
                <Input name={`name_${c.id}`} defaultValue={c.name} aria-label={m.contactNameLabel} />
                {errorFor(`${c.id}_name`)}
              </div>
              <div className="flex flex-col gap-1">
                <Input name={`role_${c.id}`} defaultValue={c.role} placeholder={m.contactRolePlaceholder} aria-label={m.contactRoleLabel} />
                {errorFor(`${c.id}_role`)}
              </div>
              <div className="flex flex-col gap-1">
                <Input name={`email_${c.id}`} type="email" defaultValue={c.email} aria-label={m.contactEmailLabel} />
                {errorFor(`${c.id}_email`)}
              </div>
              <div className="flex flex-col gap-1">
                {deliverySelect(`delivery_${c.id}`, c.delivery, m.contactDeliveryLabel)}
                {errorFor(`${c.id}_delivery`)}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                className="self-start text-danger"
                aria-label={m.contactRemoveAction}
                title={m.contactRemoveAction}
                onClick={() => toggleRemove(c.id)}
              >
                <Trash2 aria-hidden="true" className="h-4 w-4" />
              </Button>
            </div>
          )
        )}

        {newRows.map((i) => (
          <div key={`new-${i}`} className={grid}>
            <div className="flex flex-col gap-1">
              <Input name={`newName_${i}`} placeholder={m.contactNameLabel} aria-label={m.contactNameLabel} />
              {errorFor(`new${i}_name`)}
            </div>
            <div className="flex flex-col gap-1">
              <Input name={`newRole_${i}`} placeholder={m.contactRolePlaceholder} aria-label={m.contactRoleLabel} />
              {errorFor(`new${i}_role`)}
            </div>
            <div className="flex flex-col gap-1">
              <Input name={`newEmail_${i}`} type="email" placeholder={m.contactEmailLabel} aria-label={m.contactEmailLabel} />
              {errorFor(`new${i}_email`)}
            </div>
            <div className="flex flex-col gap-1">
              {deliverySelect(`newDelivery_${i}`, "TO", m.contactDeliveryLabel)}
              {errorFor(`new${i}_delivery`)}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="self-start text-danger"
              aria-label={m.removeRowAction}
              title={m.removeRowAction}
              onClick={() => setNewRows((rows) => rows.filter((r) => r !== i))}
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </Button>
          </div>
        ))}

        {contacts.length + newRows.length === 0 ? <p className="text-sm text-muted-foreground">{m.contactsEmpty}</p> : null}

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={nextRow >= MAX_NEW_ROWS}
            onClick={() => {
              setNewRows((rows) => [...rows, nextRow]);
              setNextRow((n) => n + 1);
            }}
          >
            {m.contactAddAction}
          </Button>
          <Button type="submit" size="sm" disabled={isPending}>
            {m.saveChangesLabel}
          </Button>
        </div>
        <FormMessage state={state} />
      </form>
    </section>
  );
}
