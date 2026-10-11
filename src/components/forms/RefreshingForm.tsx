"use client";

import { useTransition, type FormHTMLAttributes, type ReactNode } from "react";
import { useRouter } from "next/navigation";

interface RefreshingFormProps extends Omit<FormHTMLAttributes<HTMLFormElement>, "action"> {
  /** A server action that returns nothing (archive, unassign, revoke, ...). */
  action: (formData: FormData) => Promise<void>;
  children: ReactNode;
}

/**
 * A plain one-button form whose action changes data shown on the page:
 * runs the action, then reloads the page's data so the change shows at
 * once. Its controls are disabled while it runs, so a double click can't
 * submit twice.
 */
export function RefreshingForm({ action, children, ...rest }: RefreshingFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <form
      {...rest}
      action={(formData) =>
        startTransition(async () => {
          await action(formData);
          router.refresh();
        })
      }
    >
      <fieldset disabled={pending} className="contents">
        {children}
      </fieldset>
    </form>
  );
}
