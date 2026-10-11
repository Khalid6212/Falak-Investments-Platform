"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import type { ActionState } from "../../actions";

export const labelClass = "text-xs font-medium text-muted-foreground";
export const fieldClass = "flex flex-col gap-1";

export const initialActionState: ActionState = { error: null };

export function FormMessage({ state }: { state: ActionState }) {
  const { t } = useLanguage();
  if (state.error) {
    return (
      <p role="alert" className="text-xs font-semibold text-danger">
        {state.error}
      </p>
    );
  }
  if (state.success) {
    return (
      <div className="space-y-1">
        <p className="text-xs font-medium text-nebula-aqua">{t.admin.manage.successMessage}</p>
        {state.notice ? <p className="text-xs text-foreground">{state.notice}</p> : null}
      </div>
    );
  }
  return null;
}

// ---- Forms with per-field errors (company / vehicle / investor) ----

type EntityFormState = ActionState & { submission?: number };

/**
 * Wraps a create/edit action so each submission gets a number; the form
 * is keyed by it and remounts with its fields pre-filled from what was
 * submitted (or the saved record). A rejected form keeps everything the
 * user typed, with only the bad fields highlighted; a successful create
 * starts empty again. The first highlighted field gets focus.
 */
export function useEntityForm(action: (state: ActionState, formData: FormData) => Promise<ActionState>) {
  const [state, formAction, isPending] = useActionState(
    async (prev: EntityFormState, formData: FormData): Promise<EntityFormState> => ({
      ...(await action(prev, formData)),
      submission: (prev.submission ?? 0) + 1,
    }),
    initialActionState as EntityFormState
  );
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  useEffect(() => {
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
    // A successful save changes what lists on the page show.
    if (state.submission && state.success) router.refresh();
  }, [state.submission, state.success, router]);

  return { state, formAction, isPending, formRef, formKey: state.submission ?? 0 };
}

/** Red outline for a field the server rejected. */
export const invalidClass = "aria-[invalid=true]:shadow-[inset_0_0_0_2px_var(--danger)]";

/** Value to pre-fill: what was just submitted, else the saved record, else empty. */
export function prefill(state: ActionState, saved: Record<string, string | string[]> | undefined, name: string): string {
  const v = state.values?.[name] ?? saved?.[name];
  return typeof v === "string" ? v : "";
}

export function prefillList(state: ActionState, saved: Record<string, string | string[]> | undefined, name: string): string[] {
  const v = state.values?.[name] ?? saved?.[name];
  return Array.isArray(v) ? v : [];
}

/** aria wiring for one input: marks it invalid and links its message. */
export function fieldA11y(state: ActionState, id: string, name: string) {
  return state.fieldErrors?.[name]
    ? { "aria-invalid": true as const, "aria-describedby": `${id}-error` }
    : { "aria-invalid": false as const };
}

export function FieldError({ state, id, name }: { state: ActionState; id: string; name: string }) {
  const message = state.fieldErrors?.[name];
  if (!message) return null;
  return (
    <p id={`${id}-error`} className="text-xs font-semibold text-danger">
      {message}
    </p>
  );
}
