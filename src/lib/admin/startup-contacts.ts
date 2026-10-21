import "server-only";
import type { ContactDelivery, Department } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { requireFalakRoleWithDepartmentScope } from "@/lib/auth/department-scope";
import { writeAuditEvent } from "@/lib/audit/write-audit-event";
import { normalizeEmail } from "@/lib/auth/utils";

// A startup's report contacts: who its report emails (requests, reminders,
// change requests) go to, as To or Cc, kept by Falak staff in the startup's
// department and editable at any time. See StartupContact in the schema.

export interface StartupContactDTO {
  id: string;
  name: string;
  email: string;
  role: string;
  delivery: ContactDelivery;
}

const DELIVERIES: ContactDelivery[] = ["TO", "CC", "NONE"];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_TEXT = 200;
export const MAX_NEW_CONTACT_ROWS = 20;

const inScope = (departments: Department[] | null, department: Department) => departments === null || departments.includes(department);

/** The startup's current contacts, in order. Null if out of the caller's department or gone. */
export async function getStartupContacts(companyId: string): Promise<StartupContactDTO[] | null> {
  const { departments } = await requireFalakRoleWithDepartmentScope("FALAK_OPERATIONS");
  const company = await db.company.findUnique({
    where: { id: companyId },
    select: {
      department: true,
      archivedAt: true,
      contacts: { where: { deletedAt: null }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
    },
  });
  if (!company || company.archivedAt || !inScope(departments, company.department)) return null;
  return company.contacts.map((c) => ({ id: c.id, name: c.name, email: c.email, role: c.role ?? "", delivery: c.delivery }));
}

export interface SaveContactsResult {
  error: string | null;
  success?: boolean;
  fieldErrors?: Record<string, string>;
}

/**
 * Saves the whole contact list from the form in one go: edits to existing
 * contacts (name_<id>, email_<id>, role_<id>, delivery_<id>), removals
 * (remove_<id>=on, kept as deletedAt) and new rows (newName_<i>, ...).
 * Rows stay in the order shown. Every row needs a name and a valid email;
 * the same email can't appear twice.
 */
export async function saveStartupContacts(formData: FormData): Promise<SaveContactsResult> {
  const { user, departments } = await requireFalakRoleWithDepartmentScope("FALAK_OPERATIONS");
  const companyId = formData.get("companyId");
  if (typeof companyId !== "string" || !companyId) return { error: "Something went wrong. Reload and try again." };

  const company = await db.company.findUnique({
    where: { id: companyId },
    select: {
      department: true,
      archivedAt: true,
      contacts: { where: { deletedAt: null }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { id: true } },
    },
  });
  if (!company || company.archivedAt) return { error: "Something went wrong. Reload and try again." };
  if (!inScope(departments, company.department)) return { error: "You can only manage startups in your own department." };

  const read = (name: string) => {
    const v = formData.get(name);
    return typeof v === "string" ? v.trim() : "";
  };
  const fieldErrors: Record<string, string> = {};
  const seen = new Set<string>();
  const check = (prefix: string, name: string, email: string, role: string, delivery: string) => {
    if (!name || name.length > MAX_TEXT) fieldErrors[`${prefix}name`] = "Enter a name.";
    if (!EMAIL_PATTERN.test(email) || email.length > MAX_TEXT) fieldErrors[`${prefix}email`] = "Enter a valid email.";
    else if (seen.has(normalizeEmail(email))) fieldErrors[`${prefix}email`] = "This email is already in the list.";
    else seen.add(normalizeEmail(email));
    if (role.length > MAX_TEXT) fieldErrors[`${prefix}role`] = `Up to ${MAX_TEXT} characters.`;
    if (!DELIVERIES.includes(delivery as ContactDelivery)) fieldErrors[`${prefix}delivery`] = "Choose To, Cc or Don't email.";
  };

  const updates: { id: string; data: { name: string; email: string; role: string | null; delivery: ContactDelivery; sortOrder: number } }[] = [];
  const removed: string[] = [];
  let order = 0;
  // Contacts keep the order the form lists them in; new ones go last.
  for (const { id } of company.contacts) {
    if (formData.get(`remove_${id}`) === "on") {
      removed.push(id);
      continue;
    }
    const [name, email, role, delivery] = [read(`name_${id}`), read(`email_${id}`), read(`role_${id}`), read(`delivery_${id}`)];
    check(`${id}_`, name, email, role, delivery);
    updates.push({ id, data: { name, email: normalizeEmail(email), role: role || null, delivery: delivery as ContactDelivery, sortOrder: order } });
    order++;
  }

  const added: { name: string; email: string; role: string | null; delivery: ContactDelivery; sortOrder: number }[] = [];
  for (let i = 0; i < MAX_NEW_CONTACT_ROWS; i++) {
    const [name, email, role, delivery] = [read(`newName_${i}`), read(`newEmail_${i}`), read(`newRole_${i}`), read(`newDelivery_${i}`) || "TO"];
    if (!name && !email && !role) continue;
    check(`new${i}_`, name, email, role, delivery);
    added.push({ name, email: normalizeEmail(email), role: role || null, delivery: delivery as ContactDelivery, sortOrder: order++ });
  }

  if (Object.keys(fieldErrors).length > 0) return { error: "Fix the highlighted fields and try again.", fieldErrors };

  const now = new Date();
  try {
    await db.$transaction(async (tx) => {
      for (const u of updates) await tx.startupContact.update({ where: { id: u.id }, data: u.data });
      for (const id of removed) await tx.startupContact.update({ where: { id }, data: { deletedAt: now } });
      if (added.length > 0) await tx.startupContact.createMany({ data: added.map((a) => ({ ...a, companyId })) });
      await writeAuditEvent(tx, {
        actorId: user.id,
        action: "company.contacts_updated",
        targetType: "Company",
        targetId: companyId,
        meta: {
          updated: updates.map((u) => ({ id: u.id, email: u.data.email, delivery: u.data.delivery })),
          removed,
          added: added.map((a) => ({ email: a.email, delivery: a.delivery })),
        },
      });
    });
  } catch (error) {
    console.error("Saving startup contacts failed:", error);
    return { error: "Something went wrong. Check your input and try again." };
  }
  return { error: null, success: true };
}
