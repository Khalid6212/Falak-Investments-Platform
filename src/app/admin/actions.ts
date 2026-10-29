"use server";

import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireFalakRole } from "@/lib/auth/authorization";
import { requireFalakRoleWithDepartmentScope } from "@/lib/auth/department-scope";
import { validateNewTemplate, toMetricKey } from "@/lib/admin/template-validation";
import { notifyReportRequest, describeNotifyResult } from "@/lib/reporting/report-request-notify";
import {
  validateCompany,
  validateVehicle,
  validateInvestor,
  FIX_HIGHLIGHTED,
  type FieldErrors,
  type FormValues,
} from "@/lib/admin/entity-validation";
import { UnauthenticatedError, ForbiddenError } from "@/lib/auth/authorization-errors";
import { hashInviteToken } from "@/lib/auth/invite-token";
import { normalizeEmail, MAX_RAW_EMAIL_LENGTH } from "@/lib/auth/utils";
import { isAuthError, GENERIC_ACCESS_DENIED } from "@/lib/auth/action-error";
import { writeAuditEvent } from "@/lib/audit/write-audit-event";
import { BACKUP_DAYS, BACKUP_FIELDS, companySnapshot } from "@/lib/admin/company-backups";
import { ALL_DEPARTMENTS_VALUE, BOTH_DEPARTMENTS_MANAGEMENT_ONLY, parseDepartmentChoice } from "@/lib/auth/department-choice";
import { convertToDisplay, type DisplayCurrency } from "@/lib/currency/convert";
import { requestSignInLink } from "@/lib/auth/request-sign-in";
import { hashPassword, MIN_PASSWORD_LENGTH, MAX_RAW_PASSWORD_LENGTH } from "@/lib/auth/password";
import { NUMERIC_DATA_TYPES, SYSTEM_METRIC_KEYS } from "@/lib/reporting/system-metric-keys";
import { saveStartupContacts } from "@/lib/admin/startup-contacts";
import { DEFAULT_REMINDER_SETTINGS, REMINDER_LIMITS, type ReminderSettings } from "@/lib/reporting/reminder-schedule";
import type {
  Currency,
  MetricDataType,
  CompanyValuationType,
  InvestorCapitalTransactionType,
  Department,
  PlatformRole,
} from "@/generated/prisma/client";

export interface ActionState {
  error: string | null;
  success?: boolean;
  // Extra information shown after a successful save (e.g. who was emailed).
  notice?: string;
  // Per-field messages, keyed by input name -- the form highlights exactly these.
  fieldErrors?: FieldErrors;
  // What was submitted, so a rejected form keeps everything the user typed.
  values?: FormValues;
}

export interface InviteActionState {
  error: string | null;
  fieldErrors?: FieldErrors;
  inviteUrl?: string | null;
}

const GENERIC_ERROR = "Something went wrong. Check your input and try again.";
const MAX_NAME_LENGTH = 200;
const CURRENCIES: Currency[] = ["SAR", "USD"];
const METRIC_DATA_TYPES: MetricDataType[] = ["Currency", "Percent", "Number", "Date", "Text", "Boolean"];
// Bumped from 20 -- a comprehensive template (financial + health +
// customer + qualitative fields, matching a real investor-reporting
// spreadsheet) comfortably exceeds the old cap.
const MAX_METRIC_ROWS = 40;
const VALUATION_TYPES: CompanyValuationType[] = ["LastRound", "InternalMark", "ThirdPartyMark", "Exit", "WrittenOff"];
const AMOUNT_PATTERN = /^\d+(\.\d{1,4})?$/;
const MAX_SOURCE_LENGTH = 200;
const DEPARTMENTS: Department[] = ["VentureBuilder", "InvestmentDepartment"];
const MIN_VINTAGE_YEAR = 1990;
const MAX_VINTAGE_YEAR = 2100;

function readString(formData: FormData, field: string): string | null {
  const value = formData.get(field);
  return typeof value === "string" ? value.trim() : null;
}

/** Same as readString, but also strips thousands-separator commas -- every amount field should read through this, not readString. */
function readAmount(formData: FormData, field: string): string | null {
  const value = readString(formData, field);
  return value === null ? null : value.replace(/,/g, "");
}

// Staff below Admin may only touch records in their own department.
// departments === null means unscoped (Admin).
const OUT_OF_DEPARTMENT = "You can only manage records in your own department.";

function inDepartment(departments: Department[] | null, department: Department | null | undefined): boolean {
  return departments === null || (department != null && departments.includes(department));
}

async function companyInDepartment(departments: Department[] | null, companyId: string): Promise<boolean> {
  if (departments === null) return true;
  const company = await db.company.findUnique({ where: { id: companyId }, select: { department: true } });
  return inDepartment(departments, company?.department);
}

async function vehicleInDepartment(departments: Department[] | null, vehicleId: string): Promise<boolean> {
  if (departments === null) return true;
  const vehicle = await db.vehicle.findUnique({ where: { id: vehicleId }, select: { department: true } });
  return inDepartment(departments, vehicle?.department);
}

async function investorInDepartment(departments: Department[] | null, investorId: string): Promise<boolean> {
  if (departments === null) return true;
  const investor = await db.investor.findUnique({ where: { id: investorId }, select: { department: true } });
  return inDepartment(departments, investor?.department);
}

// Per-field validation: every failing field gets its own message, so the
// form can highlight exactly those fields (see useForm / fieldErrors).
type FieldCheck = [field: string, ok: unknown, message: string];
const FIELD = {
  required: "Required.",
  choose: "Choose an option.",
  amount: "Enter a number, e.g. 1,000,000 or 2500.50.",
  date: "Enter a valid date.",
  email: "Enter a valid email address.",
  tooLong: (max: number) => `Up to ${max} characters.`,
};
const isDateInput = (raw: string | null) => Boolean(raw) && !Number.isNaN(new Date(raw!).getTime());

function checkFields(checks: FieldCheck[]): ActionState | null {
  const fieldErrors: FieldErrors = {};
  for (const [field, ok, message] of checks) {
    if (!ok && !fieldErrors[field]) fieldErrors[field] = message;
  }
  return Object.keys(fieldErrors).length > 0 ? { error: FIX_HIGHLIGHTED, fieldErrors } : null;
}

function isValidName(value: string | null): value is string {
  return value !== null && value.length > 0 && value.length <= MAX_NAME_LENGTH;
}

// ============================================================
// Company
// ============================================================

export async function createCompanyAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  let user;
  let departments: Department[] | null = null;
  try {
    ({ user, departments } = await requireFalakRoleWithDepartmentScope("FALAK_OPERATIONS"));
  } catch (error) {
    if (isAuthError(error)) {
      return { error: GENERIC_ACCESS_DENIED };
    }
    throw error;
  }

  const { values, errors, input } = validateCompany(formData, departments);
  if (!input) {
    return { error: FIX_HIGHLIGHTED, fieldErrors: errors, values };
  }
  if (await db.company.findUnique({ where: { slug: input.slug } })) {
    return { error: FIX_HIGHLIGHTED, fieldErrors: { slug: "That slug is already used by another company." }, values };
  }

  try {
    await db.$transaction(async (tx) => {
      const company = await tx.company.create({ data: input });
      await writeAuditEvent(tx, {
        actorId: user.id,
        action: "company.created",
        targetType: "Company",
        targetId: company.id,
      });
    });
  } catch {
    return { error: GENERIC_ERROR, values };
  }

  return { error: null, success: true };
}

export async function updateCompanyAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  let user;
  let departments: Department[] | null = null;
  try {
    ({ user, departments } = await requireFalakRoleWithDepartmentScope("FALAK_OPERATIONS"));
  } catch (error) {
    if (isAuthError(error)) {
      return { error: GENERIC_ACCESS_DENIED };
    }
    throw error;
  }

  const companyId = readString(formData, "companyId");
  if (!companyId || !(await companyInDepartment(departments, companyId))) {
    return { error: OUT_OF_DEPARTMENT };
  }

  const { values, errors, input } = validateCompany(formData, departments);
  if (!input) {
    return { error: FIX_HIGHLIGHTED, fieldErrors: errors, values };
  }
  const slugOwner = await db.company.findUnique({ where: { slug: input.slug }, select: { id: true } });
  if (slugOwner && slugOwner.id !== companyId) {
    return { error: FIX_HIGHLIGHTED, fieldErrors: { slug: "That slug is already used by another company." }, values };
  }

  try {
    await db.$transaction(async (tx) => {
      // The previous details go into the audit event: a backup an Admin
      // can restore (see company-backups.ts).
      const before = await tx.company.findUnique({ where: { id: companyId } });
      await tx.company.update({ where: { id: companyId }, data: input });
      await writeAuditEvent(tx, {
        actorId: user.id,
        action: "company.updated",
        targetType: "Company",
        targetId: companyId,
        meta: before ? { source: "edit", before: companySnapshot(before as unknown as Record<string, unknown>) } : { source: "edit" },
      });
    });
  } catch {
    return { error: GENERIC_ERROR, values };
  }

  return { error: null, success: true, values };
}

/**
 * Puts a startup's details back to an earlier version saved within the
 * last BACKUP_DAYS days. Admin only. The details being replaced are backed
 * up in turn, so a restore can itself be undone. The link name is never
 * changed by a restore.
 */
export async function restoreCompanyBackupAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  let user;
  try {
    ({ user } = await requireFalakRole("FALAK_ADMIN"));
  } catch (error) {
    if (isAuthError(error)) return { error: GENERIC_ACCESS_DENIED };
    throw error;
  }
  const eventId = readString(formData, "backupId");
  if (!eventId) return { error: GENERIC_ERROR };

  const event = await db.auditEvent.findUnique({ where: { id: eventId }, select: { targetType: true, targetId: true, action: true, createdAt: true, meta: true } });
  const saved = (event?.meta as { before?: Record<string, unknown> } | null)?.before;
  const tooOld = event ? Date.now() - event.createdAt.getTime() > BACKUP_DAYS * 24 * 60 * 60 * 1000 : true;
  if (!event || event.targetType !== "Company" || !["company.updated", "company.restored"].includes(event.action) || !saved || tooOld) {
    return { error: "That earlier version is no longer available." };
  }

  try {
    await db.$transaction(async (tx) => {
      const current = await tx.company.findUnique({ where: { id: event.targetId } });
      if (!current || current.deletedAt) throw new Error("company gone");
      // Only the backed-up fields the saved copy actually holds.
      const data = Object.fromEntries(BACKUP_FIELDS.filter((f) => f in saved).map((f) => [f, saved[f]]));
      await tx.company.update({ where: { id: current.id }, data });
      await writeAuditEvent(tx, {
        actorId: user.id,
        action: "company.restored",
        targetType: "Company",
        targetId: current.id,
        meta: { source: "restore", restoredFrom: eventId, before: companySnapshot(current as unknown as Record<string, unknown>) },
      });
    });
  } catch (error) {
    console.error("restoreCompanyBackupAction failed", error);
    return { error: GENERIC_ERROR };
  }
  return { error: null, success: true };
}

// Plain (formData) => void signature -- used directly as a <form
// action={archiveCompanyAction}> per table row, not through
// useActionState. Next.js refreshes the current route's Server Components
// after any Server Action submitted via a <form> completes, so /admin's
// server-fetched data re-runs and the row disappears/updates without a
// manual redirect or revalidatePath call.
export async function archiveCompanyAction(formData: FormData): Promise<void> {
  let user;
  let departments: Department[] | null = null;
  try {
    ({ user, departments } = await requireFalakRoleWithDepartmentScope("FALAK_OPERATIONS"));
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      redirect("/sign-in");
    }
    if (error instanceof ForbiddenError) {
      return;
    }
    throw error;
  }
  const companyId = readString(formData, "companyId");
  if (!companyId || !(await companyInDepartment(departments, companyId))) return;
  await db.$transaction(async (tx) => {
    await tx.company.update({ where: { id: companyId }, data: { archivedAt: new Date() } });
    await writeAuditEvent(tx, { actorId: user.id, action: "company.archived", targetType: "Company", targetId: companyId });
  });
}

// Reclassifies an EXISTING company's department -- the create form only
// sets this going forward; every company created before this field
// existed needs it set once via this separate action instead of a full
// edit form for the other (rarely-changing) company fields.
export async function setCompanyDepartmentAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  let user;
  let departments: Department[] | null = null;
  try {
    ({ user, departments } = await requireFalakRoleWithDepartmentScope("FALAK_OPERATIONS"));
  } catch (error) {
    if (isAuthError(error)) {
      return { error: GENERIC_ACCESS_DENIED };
    }
    throw error;
  }

  const companyId = readString(formData, "companyId");
  const department = readString(formData, "department");
  const invalid = checkFields([
    ["companyId", companyId, FIELD.choose],
    ["department", department && DEPARTMENTS.includes(department as Department), FIELD.choose],
  ]);
  if (invalid || !companyId || !department) return invalid ?? { error: GENERIC_ERROR };
  // A scoped user can neither move a company out of their department nor pull one in.
  if (!(await companyInDepartment(departments, companyId))) {
    return { error: OUT_OF_DEPARTMENT, fieldErrors: { companyId: OUT_OF_DEPARTMENT } };
  }
  if (!inDepartment(departments, department as Department)) {
    return { error: OUT_OF_DEPARTMENT, fieldErrors: { department: OUT_OF_DEPARTMENT } };
  }

  try {
    await db.$transaction(async (tx) => {
      await tx.company.update({ where: { id: companyId }, data: { department: department as Department } });
      await writeAuditEvent(tx, {
        actorId: user.id,
        action: "company.department_changed",
        targetType: "Company",
        targetId: companyId,
      });
    });
  } catch {
    return { error: GENERIC_ERROR };
  }

  return { error: null, success: true };
}

// ============================================================
// Vehicle
// ============================================================

export async function createVehicleAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  let user;
  let departments: Department[] | null = null;
  try {
    ({ user, departments } = await requireFalakRoleWithDepartmentScope("FALAK_OPERATIONS"));
  } catch (error) {
    if (isAuthError(error)) {
      return { error: GENERIC_ACCESS_DENIED };
    }
    throw error;
  }

  const { values, errors, input } = validateVehicle(formData, departments);
  if (!input) {
    return { error: FIX_HIGHLIGHTED, fieldErrors: errors, values };
  }
  if (await db.vehicle.findUnique({ where: { slug: input.slug } })) {
    return { error: FIX_HIGHLIGHTED, fieldErrors: { slug: "That slug is already used by another vehicle." }, values };
  }

  try {
    await db.$transaction(async (tx) => {
      const vehicle = await tx.vehicle.create({ data: input });
      await writeAuditEvent(tx, { actorId: user.id, action: "vehicle.created", targetType: "Vehicle", targetId: vehicle.id });
    });
  } catch {
    return { error: GENERIC_ERROR, values };
  }

  return { error: null, success: true };
}

export async function updateVehicleAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  let user;
  let departments: Department[] | null = null;
  try {
    ({ user, departments } = await requireFalakRoleWithDepartmentScope("FALAK_OPERATIONS"));
  } catch (error) {
    if (isAuthError(error)) {
      return { error: GENERIC_ACCESS_DENIED };
    }
    throw error;
  }

  const vehicleId = readString(formData, "vehicleId");
  if (!vehicleId || !(await vehicleInDepartment(departments, vehicleId))) {
    return { error: OUT_OF_DEPARTMENT };
  }

  const { values, errors, input } = validateVehicle(formData, departments);
  if (!input) {
    return { error: FIX_HIGHLIGHTED, fieldErrors: errors, values };
  }
  const slugOwner = await db.vehicle.findUnique({ where: { slug: input.slug }, select: { id: true } });
  if (slugOwner && slugOwner.id !== vehicleId) {
    return { error: FIX_HIGHLIGHTED, fieldErrors: { slug: "That slug is already used by another vehicle." }, values };
  }

  try {
    await db.$transaction(async (tx) => {
      await tx.vehicle.update({ where: { id: vehicleId }, data: input });
      await writeAuditEvent(tx, { actorId: user.id, action: "vehicle.updated", targetType: "Vehicle", targetId: vehicleId });
    });
  } catch {
    return { error: GENERIC_ERROR, values };
  }

  return { error: null, success: true, values };
}

// Sets an EXISTING vehicle's vintage year -- same "new field, old rows
// need a one-off setter rather than a full edit form" rationale as
// setCompanyDepartmentAction above.
export async function setVehicleVintageYearAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  let user;
  let departments: Department[] | null = null;
  try {
    ({ user, departments } = await requireFalakRoleWithDepartmentScope("FALAK_OPERATIONS"));
  } catch (error) {
    if (isAuthError(error)) {
      return { error: GENERIC_ACCESS_DENIED };
    }
    throw error;
  }

  const vehicleId = readString(formData, "vehicleId");
  const vintageYearRaw = readString(formData, "vintageYear");
  const vintageYear = vintageYearRaw ? Number(vintageYearRaw) : null;
  const invalid = checkFields([
    ["vehicleId", vehicleId, FIELD.choose],
    [
      "vintageYear",
      vintageYearRaw && Number.isInteger(vintageYear) && vintageYear! >= MIN_VINTAGE_YEAR && vintageYear! <= MAX_VINTAGE_YEAR,
      `Enter a year between ${MIN_VINTAGE_YEAR} and ${MAX_VINTAGE_YEAR}.`,
    ],
  ]);
  if (invalid || !vehicleId) return invalid ?? { error: GENERIC_ERROR };
  if (!(await vehicleInDepartment(departments, vehicleId))) {
    return { error: OUT_OF_DEPARTMENT, fieldErrors: { vehicleId: OUT_OF_DEPARTMENT } };
  }

  try {
    await db.$transaction(async (tx) => {
      await tx.vehicle.update({ where: { id: vehicleId }, data: { vintageYear } });
      await writeAuditEvent(tx, {
        actorId: user.id,
        action: "vehicle.vintage_year_set",
        targetType: "Vehicle",
        targetId: vehicleId,
      });
    });
  } catch {
    return { error: GENERIC_ERROR };
  }

  return { error: null, success: true };
}

export async function archiveVehicleAction(formData: FormData): Promise<void> {
  let user;
  let departments: Department[] | null = null;
  try {
    ({ user, departments } = await requireFalakRoleWithDepartmentScope("FALAK_OPERATIONS"));
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      redirect("/sign-in");
    }
    if (error instanceof ForbiddenError) {
      return;
    }
    throw error;
  }
  const vehicleId = readString(formData, "vehicleId");
  if (!vehicleId || !(await vehicleInDepartment(departments, vehicleId))) return;
  await db.$transaction(async (tx) => {
    await tx.vehicle.update({ where: { id: vehicleId }, data: { archivedAt: new Date() } });
    await writeAuditEvent(tx, { actorId: user.id, action: "vehicle.archived", targetType: "Vehicle", targetId: vehicleId });
  });
}

// ============================================================
// Investor
// ============================================================

export async function createInvestorAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  let user;
  let departments: Department[] | null = null;
  try {
    ({ user, departments } = await requireFalakRoleWithDepartmentScope("FALAK_OPERATIONS"));
  } catch (error) {
    if (isAuthError(error)) {
      return { error: GENERIC_ACCESS_DENIED };
    }
    throw error;
  }

  const { values, errors, input } = validateInvestor(formData, departments);
  if (!input) {
    return { error: FIX_HIGHLIGHTED, fieldErrors: errors, values };
  }

  try {
    await db.$transaction(async (tx) => {
      const investor = await tx.investor.create({ data: input });
      await writeAuditEvent(tx, { actorId: user.id, action: "investor.created", targetType: "Investor", targetId: investor.id });
    });
  } catch {
    return { error: GENERIC_ERROR, values };
  }

  return { error: null, success: true };
}

export async function updateInvestorAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  let user;
  let departments: Department[] | null = null;
  try {
    ({ user, departments } = await requireFalakRoleWithDepartmentScope("FALAK_OPERATIONS"));
  } catch (error) {
    if (isAuthError(error)) {
      return { error: GENERIC_ACCESS_DENIED };
    }
    throw error;
  }

  const investorId = readString(formData, "investorId");
  if (!investorId || !(await investorInDepartment(departments, investorId))) {
    return { error: OUT_OF_DEPARTMENT };
  }

  const { values, errors, input } = validateInvestor(formData, departments);
  if (!input) {
    return { error: FIX_HIGHLIGHTED, fieldErrors: errors, values };
  }

  try {
    await db.$transaction(async (tx) => {
      await tx.investor.update({ where: { id: investorId }, data: input });
      await writeAuditEvent(tx, { actorId: user.id, action: "investor.updated", targetType: "Investor", targetId: investorId });
    });
  } catch {
    return { error: GENERIC_ERROR, values };
  }

  return { error: null, success: true, values };
}

export async function archiveInvestorAction(formData: FormData): Promise<void> {
  let user;
  let departments: Department[] | null = null;
  try {
    ({ user, departments } = await requireFalakRoleWithDepartmentScope("FALAK_OPERATIONS"));
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      redirect("/sign-in");
    }
    if (error instanceof ForbiddenError) {
      return;
    }
    throw error;
  }
  const investorId = readString(formData, "investorId");
  if (!investorId || !(await investorInDepartment(departments, investorId))) return;
  await db.$transaction(async (tx) => {
    await tx.investor.update({ where: { id: investorId }, data: { archivedAt: new Date() } });
    await writeAuditEvent(tx, { actorId: user.id, action: "investor.archived", targetType: "Investor", targetId: investorId });
  });
}

// ============================================================
// Vehicle <-> company ownership link
// ============================================================

export async function linkVehicleToCompanyAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  let user;
  let departments: Department[] | null = null;
  try {
    ({ user, departments } = await requireFalakRoleWithDepartmentScope("FALAK_OPERATIONS"));
  } catch (error) {
    if (isAuthError(error)) {
      return { error: GENERIC_ACCESS_DENIED };
    }
    throw error;
  }

  const companyId = readString(formData, "companyId");
  const vehicleId = readString(formData, "vehicleId");
  const investedAmount = readAmount(formData, "investedAmount");
  const currency = readString(formData, "currency");
  const ownershipPct = readAmount(formData, "ownershipPct");
  const signedDateRaw = readString(formData, "signedDate");

  const invalid = checkFields([
    ["companyId", companyId, FIELD.choose],
    ["vehicleId", vehicleId, FIELD.choose],
    ["investedAmount", investedAmount && AMOUNT_PATTERN.test(investedAmount), FIELD.amount],
    ["currency", currency && CURRENCIES.includes(currency as Currency), FIELD.choose],
    // Optional: often not known when the investment is recorded.
    ["ownershipPct", !ownershipPct || AMOUNT_PATTERN.test(ownershipPct), "Enter a decimal share, e.g. 0.10 for 10%, or leave it empty."],
    ["signedDate", isDateInput(signedDateRaw), FIELD.date],
  ]);
  if (invalid || !companyId || !vehicleId || !investedAmount || !currency || !signedDateRaw) {
    return invalid ?? { error: GENERIC_ERROR };
  }
  const signedDate = new Date(signedDateRaw);

  const [company, vehicle] = await Promise.all([
    db.company.findUnique({ where: { id: companyId } }),
    db.vehicle.findUnique({ where: { id: vehicleId } }),
  ]);
  if (!company || !vehicle) {
    return { error: GENERIC_ERROR };
  }
  if (!inDepartment(departments, company.department) || !inDepartment(departments, vehicle.department)) {
    return { error: OUT_OF_DEPARTMENT };
  }

  try {
    await db.$transaction(async (tx) => {
      const position =
        (await tx.ownershipPosition.findFirst({ where: { companyId, vehicleId, holderType: "VEHICLE" } })) ??
        (await tx.ownershipPosition.create({ data: { companyId, vehicleId, holderType: "VEHICLE" } }));

      await tx.investmentAgreement.create({
        data: {
          agreementNumber: `${company.slug}-${vehicle.slug}-${Date.now()}`,
          ownershipPositionId: position.id,
          signedDate,
          effectiveFrom: signedDate,
          investedAmount,
          currency: currency as Currency,
          ownershipPct: ownershipPct || null,
          status: "Active",
        },
      });

      // A snapshot records a known ownership share; none when it wasn't given.
      if (ownershipPct) {
        await tx.ownershipSnapshot.create({
          data: { ownershipPositionId: position.id, asOfDate: signedDate, ownershipPct, source: "admin" },
        });
      }

      await writeAuditEvent(tx, {
        actorId: user.id,
        action: "ownership_position.linked",
        targetType: "OwnershipPosition",
        targetId: position.id,
      });
    });
  } catch {
    return { error: GENERIC_ERROR };
  }

  return { error: null, success: true };
}

// ============================================================
// Investor <-> vehicle assignment
// ============================================================

/**
 * Creates the InvestorVehiclePosition row that IS "this investor is
 * assigned to this vehicle" -- the model already existed (vehicle NAV/
 * capital summaries and investor returns already read it), but nothing
 * in the app ever wrote one; Falak had no way to actually assign an
 * investor to a vehicle. A status: "Active" row here is also exactly
 * what resolveInvestorExposure (src/lib/reporting/publish-workflow.ts)
 * checks before granting report access and emailing a published
 * report, so assigning an investor here is what makes them start
 * receiving reports for every startup that vehicle holds.
 */
export async function linkInvestorToVehicleAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  let user;
  let departments: Department[] | null = null;
  try {
    ({ user, departments } = await requireFalakRoleWithDepartmentScope("FALAK_OPERATIONS"));
  } catch (error) {
    if (isAuthError(error)) {
      return { error: GENERIC_ACCESS_DENIED };
    }
    throw error;
  }

  const investorId = readString(formData, "investorId");
  const vehicleId = readString(formData, "vehicleId");
  const currency = readString(formData, "currency");
  const effectiveFromRaw = readString(formData, "effectiveFrom");
  const commitmentAmount = readAmount(formData, "commitmentAmount");
  const calledAmount = readAmount(formData, "calledAmount");
  // "All startups in the vehicle" unless deal-by-deal is chosen.
  const exposureScope = readString(formData, "exposureScope") === "SELECTED" ? "SELECTED" : "ALL_STARTUPS";

  const invalid = checkFields([
    ["investorId", investorId, FIELD.choose],
    ["vehicleId", vehicleId, FIELD.choose],
    ["currency", currency && CURRENCIES.includes(currency as Currency), FIELD.choose],
    ["effectiveFrom", isDateInput(effectiveFromRaw), FIELD.date],
    ["commitmentAmount", !commitmentAmount || AMOUNT_PATTERN.test(commitmentAmount), FIELD.amount],
    ["calledAmount", !calledAmount || AMOUNT_PATTERN.test(calledAmount), FIELD.amount],
  ]);
  if (invalid || !investorId || !vehicleId || !currency || !effectiveFromRaw) {
    return invalid ?? { error: GENERIC_ERROR };
  }
  const effectiveFrom = new Date(effectiveFromRaw);

  const [investor, vehicle] = await Promise.all([
    db.investor.findUnique({ where: { id: investorId } }),
    db.vehicle.findUnique({ where: { id: vehicleId } }),
  ]);
  if (!investor || !vehicle) {
    return { error: GENERIC_ERROR };
  }
  if (!inDepartment(departments, investor.department) || !inDepartment(departments, vehicle.department)) {
    return { error: OUT_OF_DEPARTMENT };
  }

  const existing = await db.investorVehiclePosition.findUnique({
    where: { investorId_vehicleId_effectiveFrom: { investorId, vehicleId, effectiveFrom } },
  });
  if (existing) {
    const message = "This investor is already assigned to this vehicle as of that date.";
    return { error: message, fieldErrors: { investorId: message, effectiveFrom: message } };
  }

  // Ownership % is never typed in by hand -- it's this investor's
  // contribution (net invested) divided by the vehicle's own total
  // invested capital (every Active/Superseded InvestmentAgreement
  // under it, converted to this position's currency via the same
  // fixed 3.75 rate the portfolio overview dashboard uses), so it
  // always reflects a real share of real deployed capital rather than
  // a number Falak could type inconsistently with the rest of the
  // vehicle's cap table.
  const vehicleAgreements = await db.investmentAgreement.findMany({
    where: {
      status: { in: ["Active", "Superseded"] },
      ownershipPosition: { vehicleId },
    },
    select: { investedAmount: true, currency: true },
  });
  const vehicleInvestedCapital = vehicleAgreements.reduce((sum, a) => {
    if (a.investedAmount === null || a.currency === null) return sum;
    return sum + convertToDisplay(a.investedAmount.toNumber(), a.currency, currency as DisplayCurrency);
  }, 0);
  const ownershipPct =
    commitmentAmount && vehicleInvestedCapital > 0 ? Number(commitmentAmount) / vehicleInvestedCapital : null;

  try {
    await db.$transaction(async (tx) => {
      const position = await tx.investorVehiclePosition.create({
        data: {
          investorId,
          vehicleId,
          currency: currency as Currency,
          effectiveFrom,
          commitmentAmount: commitmentAmount || null,
          calledAmount: calledAmount || null,
          ownershipPct,
          exposureScope,
          status: "Active",
        },
      });
      await writeAuditEvent(tx, {
        actorId: user.id,
        action: "investor_vehicle_position.linked",
        targetType: "InvestorVehiclePosition",
        targetId: position.id,
      });

      // Backfill: grant this investor access to every ALREADY-PUBLISHED
      // report for a company this vehicle holds -- resolveInvestorExposure
      // only runs at the moment of a NEW publish, so without this an
      // investor assigned today would see nothing on their dashboard
      // until the next quarter's report, even though they're now
      // genuinely exposed to this vehicle's existing startups. No email
      // is (re-)sent for these backfilled grants -- "Resend to Investors"
      // on the Reports Log covers that separately, per report, if Falak
      // wants to notify by email too.
      // A deal-by-deal investor has no startups yet: their reports are
      // shared when startups are ticked on the position's Startups page.
      const vehicleCompanies =
        exposureScope === "ALL_STARTUPS"
          ? await tx.ownershipPosition.findMany({
              where: { vehicleId, holderType: "VEHICLE" },
              select: { companyId: true },
            })
          : [];
      const companyIds = [...new Set(vehicleCompanies.map((p) => p.companyId))];
      if (companyIds.length > 0) {
        const latestVersions = await tx.reportVersion.findMany({
          where: { isSuperseded: false, report: { scope: "COMPANY", companyId: { in: companyIds } } },
          select: { id: true },
        });
        for (const version of latestVersions) {
          await tx.reportAccessGrant.upsert({
            where: { reportVersionId_investorId: { reportVersionId: version.id, investorId } },
            update: {},
            create: { reportVersionId: version.id, investorId },
          });
        }
      }
    });
  } catch {
    return { error: GENERIC_ERROR };
  }

  return { error: null, success: true };
}

export async function unassignInvestorFromVehicleAction(formData: FormData): Promise<void> {
  let user;
  let departments: Department[] | null = null;
  try {
    ({ user, departments } = await requireFalakRoleWithDepartmentScope("FALAK_OPERATIONS"));
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      redirect("/sign-in");
    }
    if (error instanceof ForbiddenError) {
      return;
    }
    throw error;
  }
  const positionId = readString(formData, "positionId");
  if (!positionId) return;
  if (departments !== null) {
    const position = await db.investorVehiclePosition.findUnique({
      where: { id: positionId },
      select: { investor: { select: { department: true } }, vehicle: { select: { department: true } } },
    });
    if (!position || !inDepartment(departments, position.investor.department) || !inDepartment(departments, position.vehicle.department)) {
      return;
    }
  }
  await db.$transaction(async (tx) => {
    await tx.investorVehiclePosition.update({ where: { id: positionId }, data: { status: "Exited", effectiveTo: new Date() } });
    await writeAuditEvent(tx, {
      actorId: user.id,
      action: "investor_vehicle_position.unassigned",
      targetType: "InvestorVehiclePosition",
      targetId: positionId,
    });
  });
}

// ============================================================
// Reporting template + metric definitions
// ============================================================

export async function createReportingTemplateAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  let user;
  try {
    ({ user } = await requireFalakRole("FALAK_OPERATIONS"));
  } catch (error) {
    if (isAuthError(error)) {
      return { error: GENERIC_ACCESS_DENIED };
    }
    throw error;
  }

  const { values, errors, input } = validateNewTemplate(formData);
  if (!input) {
    return { error: FIX_HIGHLIGHTED, fieldErrors: errors, values };
  }
  const { nameEn, nameAr, metrics } = input;

  try {
    await db.$transaction(async (tx) => {
      const template = await tx.reportingTemplate.create({
        data: { nameEn, nameAr, collectFinancialStatements: formData.get("collectFinancialStatements") === "on" },
      });
      await tx.metricDefinition.createMany({
        data: metrics.map((m) => ({ ...m, templateId: template.id, required: true })),
      });
      await writeAuditEvent(tx, {
        actorId: user.id,
        action: "reporting_template.created",
        targetType: "ReportingTemplate",
        targetId: template.id,
      });
    });
  } catch {
    return { error: GENERIC_ERROR, values };
  }

  return { error: null, success: true };
}

// ============================================================
// Reporting cycle (auto-creates its 1:1 CompanySubmission)
// ============================================================

const STATEMENTS_YEAR_ERROR = "Enter a year, e.g. 2025.";
const isStatementsYear = (raw: string) => /^\d{4}$/.test(raw) && Number(raw) >= 2000 && Number(raw) <= 2100;

export async function createReportingCycleAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  let user;
  let departments: Department[] | null = null;
  try {
    ({ user, departments } = await requireFalakRoleWithDepartmentScope("FALAK_OPERATIONS"));
  } catch (error) {
    if (isAuthError(error)) {
      return { error: GENERIC_ACCESS_DENIED };
    }
    throw error;
  }

  const companyIds = formData.getAll("companyIds").filter((v): v is string => typeof v === "string" && v.length > 0);
  const templateId = readString(formData, "templateId");
  const periodLabel = readString(formData, "periodLabel");
  const periodStartRaw = readString(formData, "periodStart");
  const periodEndRaw = readString(formData, "periodEnd");
  const deadlineRaw = readString(formData, "deadline");
  const askStatements = formData.get("askStatements") === "on";
  const statementsYearRaw = readString(formData, "statementsYear");

  const invalid = checkFields([
    ["companyIds", companyIds.length > 0, "Select at least one startup."],
    ["statementsYear", !askStatements || !statementsYearRaw || isStatementsYear(statementsYearRaw), STATEMENTS_YEAR_ERROR],
    ["templateId", templateId, FIELD.choose],
    ["periodLabel", isValidName(periodLabel), FIELD.required],
    ["periodStart", isDateInput(periodStartRaw), FIELD.date],
    ["periodEnd", isDateInput(periodEndRaw), FIELD.date],
    [
      "periodEnd",
      !isDateInput(periodStartRaw) || !isDateInput(periodEndRaw) || new Date(periodEndRaw!) >= new Date(periodStartRaw!),
      "The period must end on or after its start.",
    ],
    ["deadline", isDateInput(deadlineRaw), FIELD.date],
  ]);
  if (invalid || !templateId || !periodLabel || !periodStartRaw || !periodEndRaw || !deadlineRaw) {
    return invalid ?? { error: GENERIC_ERROR };
  }
  const reminders = readReminderSettings(formData);
  if (Object.keys(reminders.fieldErrors).length > 0) return { error: FIX_HIGHLIGHTED, fieldErrors: reminders.fieldErrors };
  const periodStart = new Date(periodStartRaw);
  const periodEnd = new Date(periodEndRaw);
  const deadline = new Date(deadlineRaw);
  // Blank year: the year before the period ends (Q3 2026 -> 2025).
  const statementsYear = askStatements ? (statementsYearRaw ? Number(statementsYearRaw) : periodEnd.getUTCFullYear() - 1) : null;
  if (departments !== null) {
    const inScopeCount = await db.company.count({
      where: { id: { in: companyIds }, department: { in: departments } },
    });
    if (inScopeCount !== new Set(companyIds).size) {
      return { error: OUT_OF_DEPARTMENT, fieldErrors: { companyIds: OUT_OF_DEPARTMENT } };
    }
  }

  // One reporting cycle (the "request" being logged) per selected
  // company, all sharing the same template/period/deadline -- a
  // company that already has a cycle for this exact
  // (templateId, periodStart, periodEnd) is silently skipped rather
  // than failing the whole batch, since "request this quarter from
  // everyone except the two who already have it" is the normal case,
  // not an error.
  const created: { cycleId: string; companyId: string }[] = [];
  try {
    await db.$transaction(async (tx) => {
      for (const companyId of companyIds) {
        const existing = await tx.reportingCycle.findUnique({
          where: { companyId_templateId_periodStart_periodEnd: { companyId, templateId, periodStart, periodEnd } },
        });
        if (existing) continue;

        const cycle = await tx.reportingCycle.create({
          data: {
            companyId,
            templateId,
            periodLabel,
            periodStart,
            periodEnd,
            originalDeadline: deadline,
            currentDeadline: deadline,
            statementsYear,
            ...reminders.settings,
            status: "Open",
          },
        });
        await tx.companySubmission.create({ data: { cycleId: cycle.id, status: "draft" } });
        await writeAuditEvent(tx, {
          actorId: user.id,
          action: "reporting_cycle.created",
          targetType: "ReportingCycle",
          targetId: cycle.id,
        });
        created.push({ cycleId: cycle.id, companyId });
      }
    });
  } catch {
    return { error: GENERIC_ERROR };
  }

  if (created.length === 0) {
    const message = "Every selected startup already has this template for this period.";
    return { error: message, fieldErrors: { companyIds: message } };
  }

  // The form's "Email the request to the startup now" box: unticked creates
  // the cycle silently (e.g. data already in hand, entered by staff). Callers
  // without the box (no emailChoice field) keep emailing.
  if (formData.get("emailChoice") === "present" && formData.get("sendEmail") !== "on") {
    return { error: null, success: true, notice: "Created without emailing the startup. Use Resend on the request page to send it later." };
  }
  // Outside the transaction: the requests exist regardless of email delivery.
  const notified = await notifyReportRequest(created, { periodLabel, deadline }, user.id);
  return { error: null, success: true, notice: describeNotifyResult(notified) };
}

/**
 * Emails an existing reporting request again to every startup in it that
 * hasn't submitted yet (e.g. after adding a founder email or user).
 */
export async function resendReportRequestAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  let user;
  let departments: Department[] | null = null;
  try {
    ({ user, departments } = await requireFalakRoleWithDepartmentScope("FALAK_OPERATIONS"));
  } catch (error) {
    if (isAuthError(error)) return { error: GENERIC_ACCESS_DENIED };
    throw error;
  }

  const templateId = readString(formData, "templateId");
  const periodStartRaw = readString(formData, "periodStart");
  const periodEndRaw = readString(formData, "periodEnd");
  if (!templateId || !isDateInput(periodStartRaw) || !isDateInput(periodEndRaw)) return { error: GENERIC_ERROR };

  const cycles = await db.reportingCycle.findMany({
    where: {
      templateId,
      periodStart: new Date(periodStartRaw!),
      periodEnd: new Date(periodEndRaw!),
      company: { archivedAt: null, ...(departments ? { department: { in: departments } } : {}) },
      submission: { status: { in: ["draft", "changes_requested"] } },
    },
    select: { id: true, companyId: true, periodLabel: true, currentDeadline: true },
  });
  if (cycles.length === 0) {
    return { error: null, success: true, notice: "Every startup in this request has already submitted; nobody was emailed." };
  }

  const notified = await notifyReportRequest(
    cycles.map((c) => ({ cycleId: c.id, companyId: c.companyId })),
    { periodLabel: cycles[0].periodLabel, deadline: cycles[0].currentDeadline },
    user.id
  );
  return { error: null, success: true, notice: describeNotifyResult(notified) };
}

/**
 * Emails one startup's reporting request again (from the request's page).
 * Only while the startup can still fill it in -- once submitted there is
 * nothing to ask for.
 */
/**
 * Reads the reminder settings fields (remindersEnabled, reminderStartDays,
 * reminderEveryDays, overdueRemindersEnabled, overdueEveryDays,
 * overdueForDays). Numbers of a switched-off part keep their defaults
 * unchecked, so a half-filled form never blocks turning reminders off.
 */
function readReminderSettings(formData: FormData): { settings: ReminderSettings; fieldErrors: FieldErrors } {
  const fieldErrors: FieldErrors = {};
  const remindersEnabled = formData.get("remindersEnabled") === "on";
  const overdueRemindersEnabled = remindersEnabled && formData.get("overdueRemindersEnabled") === "on";
  const num = (name: keyof typeof REMINDER_LIMITS, active: boolean): number => {
    const fallback = DEFAULT_REMINDER_SETTINGS[name];
    const raw = readString(formData, name);
    if (!raw) return fallback;
    const value = Number(raw);
    const { min, max } = REMINDER_LIMITS[name];
    if (!Number.isInteger(value) || value < min || value > max) {
      if (active) fieldErrors[name] = `Enter a whole number from ${min} to ${max}.`;
      return fallback;
    }
    return value;
  };
  return {
    settings: {
      remindersEnabled,
      reminderStartDays: num("reminderStartDays", remindersEnabled),
      reminderEveryDays: num("reminderEveryDays", remindersEnabled),
      overdueRemindersEnabled,
      overdueEveryDays: num("overdueEveryDays", overdueRemindersEnabled),
      overdueForDays: num("overdueForDays", overdueRemindersEnabled),
    },
    fieldErrors,
  };
}

/**
 * Sets the deadline reminders for a whole reporting request (template +
 * period), for the startups in the caller's department. Nothing is sent
 * from here; the daily job follows the new settings from its next run.
 */
export async function setRequestRemindersAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  let user;
  let departments: Department[] | null = null;
  try {
    ({ user, departments } = await requireFalakRoleWithDepartmentScope("FALAK_OPERATIONS"));
  } catch (error) {
    if (isAuthError(error)) return { error: GENERIC_ACCESS_DENIED };
    throw error;
  }

  const templateId = readString(formData, "templateId");
  const periodStartRaw = readString(formData, "periodStart");
  const periodEndRaw = readString(formData, "periodEnd");
  if (!templateId || !isDateInput(periodStartRaw) || !isDateInput(periodEndRaw)) return { error: GENERIC_ERROR };
  const { settings, fieldErrors } = readReminderSettings(formData);
  if (Object.keys(fieldErrors).length > 0) return { error: FIX_HIGHLIGHTED, fieldErrors };

  try {
    await db.$transaction(async (tx) => {
      const cycles = await tx.reportingCycle.findMany({
        where: {
          templateId,
          periodStart: new Date(periodStartRaw!),
          periodEnd: new Date(periodEndRaw!),
          company: { archivedAt: null, ...(departments ? { department: { in: departments } } : {}) },
        },
        select: { id: true },
      });
      if (cycles.length === 0) throw new Error("no cycles");
      await tx.reportingCycle.updateMany({ where: { id: { in: cycles.map((c) => c.id) } }, data: settings });
      await writeAuditEvent(tx, {
        actorId: user.id,
        action: "reporting_request.reminders_set",
        targetType: "ReportingTemplate",
        targetId: templateId,
        meta: { periodStart: periodStartRaw, periodEnd: periodEndRaw, ...settings, cycleIds: cycles.map((c) => c.id) },
      });
    });
  } catch {
    return { error: GENERIC_ERROR };
  }
  return { error: null, success: true };
}

/**
 * Turns the financial statements ask on or off for a whole reporting
 * request (template + period), or changes its year -- for the startups in
 * the caller's department. Takes effect on the startups' form links and
 * on the next emails; nothing is sent from here.
 */
export async function setRequestStatementsAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  let user;
  let departments: Department[] | null = null;
  try {
    ({ user, departments } = await requireFalakRoleWithDepartmentScope("FALAK_OPERATIONS"));
  } catch (error) {
    if (isAuthError(error)) return { error: GENERIC_ACCESS_DENIED };
    throw error;
  }

  const templateId = readString(formData, "templateId");
  const periodStartRaw = readString(formData, "periodStart");
  const periodEndRaw = readString(formData, "periodEnd");
  if (!templateId || !isDateInput(periodStartRaw) || !isDateInput(periodEndRaw)) return { error: GENERIC_ERROR };
  const periodEnd = new Date(periodEndRaw!);
  const ask = formData.get("askStatements") === "on";
  const yearRaw = readString(formData, "statementsYear");
  if (ask && yearRaw && !isStatementsYear(yearRaw)) {
    return { error: FIX_HIGHLIGHTED, fieldErrors: { statementsYear: STATEMENTS_YEAR_ERROR } };
  }
  const statementsYear = ask ? (yearRaw ? Number(yearRaw) : periodEnd.getUTCFullYear() - 1) : null;

  try {
    await db.$transaction(async (tx) => {
      const cycles = await tx.reportingCycle.findMany({
        where: {
          templateId,
          periodStart: new Date(periodStartRaw!),
          periodEnd,
          company: { archivedAt: null, ...(departments ? { department: { in: departments } } : {}) },
        },
        select: { id: true },
      });
      if (cycles.length === 0) throw new Error("no cycles");
      await tx.reportingCycle.updateMany({ where: { id: { in: cycles.map((c) => c.id) } }, data: { statementsYear } });
      await writeAuditEvent(tx, {
        actorId: user.id,
        action: "reporting_request.statements_set",
        targetType: "ReportingTemplate",
        targetId: templateId,
        meta: { periodStart: periodStartRaw, periodEnd: periodEndRaw, statementsYear, cycleIds: cycles.map((c) => c.id) },
      });
    });
  } catch {
    return { error: GENERIC_ERROR };
  }
  return { error: null, success: true };
}

export async function resendCycleRequestAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  let user;
  let departments: Department[] | null = null;
  try {
    ({ user, departments } = await requireFalakRoleWithDepartmentScope("FALAK_OPERATIONS"));
  } catch (error) {
    if (isAuthError(error)) return { error: GENERIC_ACCESS_DENIED };
    throw error;
  }

  const cycleId = readString(formData, "cycleId");
  if (!cycleId) return { error: GENERIC_ERROR };
  const cycle = await db.reportingCycle.findFirst({
    where: { id: cycleId, company: { archivedAt: null } },
    select: {
      id: true,
      companyId: true,
      periodLabel: true,
      currentDeadline: true,
      company: { select: { department: true } },
      submission: { select: { status: true } },
    },
  });
  if (!cycle) return { error: GENERIC_ERROR };
  if (!inDepartment(departments, cycle.company.department)) return { error: OUT_OF_DEPARTMENT };
  if (cycle.submission && !["draft", "changes_requested"].includes(cycle.submission.status)) {
    return { error: "This startup has already submitted this report, so there is nothing to ask for." };
  }

  const notified = await notifyReportRequest(
    [{ cycleId: cycle.id, companyId: cycle.companyId }],
    { periodLabel: cycle.periodLabel, deadline: cycle.currentDeadline },
    user.id
  );
  const notice = describeNotifyResult(notified);
  if (notified.emailed.length === 0 && notified.invited.length === 0) return { error: notice || GENERIC_ERROR };
  return { error: null, success: true, notice };
}

// ============================================================
// Company invite
// ============================================================

const INVITE_EXPIRY_DAYS = 7;

export async function createCompanyInviteAction(_prevState: InviteActionState, formData: FormData): Promise<InviteActionState> {
  let user;
  let departments: Department[] | null = null;
  try {
    ({ user, departments } = await requireFalakRoleWithDepartmentScope("FALAK_OPERATIONS"));
  } catch (error) {
    if (isAuthError(error)) {
      return { error: GENERIC_ACCESS_DENIED };
    }
    throw error;
  }

  const companyId = readString(formData, "companyId");
  const emailInput = formData.get("email");

  const invalid = checkFields([["companyId", companyId, FIELD.choose], ["email", typeof emailInput === "string" && emailInput.trim() !== "" && emailInput.length <= MAX_RAW_EMAIL_LENGTH && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailInput.trim()), FIELD.email]]);
  if (invalid || !companyId || typeof emailInput !== "string") return invalid ?? { error: GENERIC_ERROR };
  const email = normalizeEmail(emailInput);

  const company = await db.company.findUnique({ where: { id: companyId } });
  if (!company) {
    return { error: GENERIC_ERROR };
  }
  if (!inDepartment(departments, company.department)) {
    return { error: OUT_OF_DEPARTMENT };
  }

  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = hashInviteToken(rawToken);
  const expiresAt = new Date(Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  try {
    await db.$transaction(async (tx) => {
      const invite = await tx.companyInvite.create({
        data: { companyId, email, tokenHash, invitedById: user.id, expiresAt },
      });
      await writeAuditEvent(tx, {
        actorId: user.id,
        action: "invite.created",
        targetType: "CompanyInvite",
        targetId: invite.id,
      });
    });
  } catch {
    return { error: GENERIC_ERROR };
  }

  // The raw token is returned exactly once, here, for the admin to copy --
  // it is never stored (only tokenHash is), never logged, and this
  // response is the only place it will ever appear again.
  return { error: null, inviteUrl: `/accept-invite?token=${rawToken}` };
}

// ============================================================
// Investor invite -- same shape as the company invite above, for an
// investor organization; accepted at /accept-investor-invite.
// ============================================================

export async function createInvestorInviteAction(_prevState: InviteActionState, formData: FormData): Promise<InviteActionState> {
  let user;
  let departments: Department[] | null = null;
  try {
    ({ user, departments } = await requireFalakRoleWithDepartmentScope("FALAK_OPERATIONS"));
  } catch (error) {
    if (isAuthError(error)) {
      return { error: GENERIC_ACCESS_DENIED };
    }
    throw error;
  }

  const investorId = readString(formData, "investorId");
  const emailInput = formData.get("email");

  const invalid = checkFields([["investorId", investorId, FIELD.choose], ["email", typeof emailInput === "string" && emailInput.trim() !== "" && emailInput.length <= MAX_RAW_EMAIL_LENGTH && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailInput.trim()), FIELD.email]]);
  if (invalid || !investorId || typeof emailInput !== "string") return invalid ?? { error: GENERIC_ERROR };
  const email = normalizeEmail(emailInput);

  const investor = await db.investor.findUnique({ where: { id: investorId } });
  if (!investor || investor.archivedAt) {
    return { error: GENERIC_ERROR };
  }
  if (!inDepartment(departments, investor.department)) {
    return { error: OUT_OF_DEPARTMENT };
  }

  // Investors get exactly one user per account -- block a second invite
  // outright while either an active membership or a still-live,
  // unaccepted invite already exists for this investor. Falak must
  // revoke the first (membership or invite) before inviting a
  // replacement.
  const [activeMembership, pendingInvite] = await Promise.all([
    db.investorMembership.findFirst({ where: { investorId, revokedAt: null } }),
    db.investorInvite.findFirst({
      where: { investorId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
    }),
  ]);
  if (activeMembership || pendingInvite) {
    const message = "This investor already has a user. Revoke their access before inviting a replacement.";
    return { error: message, fieldErrors: { investorId: message } };
  }

  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = hashInviteToken(rawToken);
  const expiresAt = new Date(Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  try {
    await db.$transaction(async (tx) => {
      const invite = await tx.investorInvite.create({
        data: { investorId, email, tokenHash, invitedById: user.id, expiresAt },
      });
      await writeAuditEvent(tx, {
        actorId: user.id,
        action: "investor_invite.created",
        targetType: "InvestorInvite",
        targetId: invite.id,
      });
    });
  } catch {
    return { error: GENERIC_ERROR };
  }

  // Returned exactly once for the admin to copy; only the hash is stored.
  return { error: null, inviteUrl: `/accept-investor-invite?token=${rawToken}` };
}

// ============================================================
// Company valuation / vehicle NAV -- insert-only, same discipline as
// every other financial-ledger table in this schema (a correction is a
// new row, never an edit; app_runtime_grants.sql grants SELECT+INSERT
// only on both tables, no UPDATE).
// ============================================================

export async function createCompanyValuationAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  let user;
  let departments: Department[] | null = null;
  try {
    ({ user, departments } = await requireFalakRoleWithDepartmentScope("FALAK_OPERATIONS"));
  } catch (error) {
    if (isAuthError(error)) {
      return { error: GENERIC_ACCESS_DENIED };
    }
    throw error;
  }

  const companyId = readString(formData, "companyId");
  const asOfDateRaw = readString(formData, "asOfDate");
  const valuationAmount = readAmount(formData, "valuationAmount");
  const currency = readString(formData, "currency");
  const valuationType = readString(formData, "valuationType");
  const sourceInput = readString(formData, "source");

  const invalid = checkFields([
    ["companyId", companyId, FIELD.choose],
    ["asOfDate", isDateInput(asOfDateRaw), FIELD.date],
    ["valuationAmount", valuationAmount && AMOUNT_PATTERN.test(valuationAmount), FIELD.amount],
    ["currency", currency && CURRENCIES.includes(currency as Currency), FIELD.choose],
    ["valuationType", valuationType && VALUATION_TYPES.includes(valuationType as CompanyValuationType), FIELD.choose],
    ["source", !sourceInput || sourceInput.length <= MAX_SOURCE_LENGTH, FIELD.tooLong(MAX_SOURCE_LENGTH)],
  ]);
  if (invalid || !companyId || !asOfDateRaw || !valuationAmount || !currency || !valuationType) {
    return invalid ?? { error: GENERIC_ERROR };
  }
  const asOfDate = new Date(asOfDateRaw);
  if (!(await companyInDepartment(departments, companyId))) {
    return { error: OUT_OF_DEPARTMENT };
  }

  try {
    await db.$transaction(async (tx) => {
      const snapshot = await tx.companyValuationSnapshot.create({
        data: {
          companyId,
          asOfDate,
          valuationAmount,
          currency: currency as Currency,
          valuationType: valuationType as CompanyValuationType,
          source: sourceInput || null,
          createdById: user.id,
        },
      });
      await writeAuditEvent(tx, {
        actorId: user.id,
        action: "company_valuation.recorded",
        targetType: "CompanyValuationSnapshot",
        targetId: snapshot.id,
      });
    });
  } catch {
    // Covers the (companyId, asOfDate, valuationType) unique-constraint
    // collision alike with any other write failure -- one generic
    // message, never a raw Prisma error surfaced to the form.
    return { error: "A valuation for this company on this date and type already exists." };
  }

  return { error: null, success: true };
}

export async function createVehicleNavAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  let user;
  let departments: Department[] | null = null;
  try {
    ({ user, departments } = await requireFalakRoleWithDepartmentScope("FALAK_OPERATIONS"));
  } catch (error) {
    if (isAuthError(error)) {
      return { error: GENERIC_ACCESS_DENIED };
    }
    throw error;
  }

  const vehicleId = readString(formData, "vehicleId");
  const asOfDateRaw = readString(formData, "asOfDate");
  const navAmount = readAmount(formData, "navAmount");
  const currency = readString(formData, "currency");
  const sourceInput = readString(formData, "source");

  const invalid = checkFields([
    ["vehicleId", vehicleId, FIELD.choose],
    ["asOfDate", isDateInput(asOfDateRaw), FIELD.date],
    ["navAmount", navAmount && AMOUNT_PATTERN.test(navAmount), FIELD.amount],
    ["currency", currency && CURRENCIES.includes(currency as Currency), FIELD.choose],
    ["source", !sourceInput || sourceInput.length <= MAX_SOURCE_LENGTH, FIELD.tooLong(MAX_SOURCE_LENGTH)],
  ]);
  if (invalid || !vehicleId || !asOfDateRaw || !navAmount || !currency) {
    return invalid ?? { error: GENERIC_ERROR };
  }
  const asOfDate = new Date(asOfDateRaw);
  if (!(await vehicleInDepartment(departments, vehicleId))) {
    return { error: OUT_OF_DEPARTMENT };
  }

  try {
    await db.$transaction(async (tx) => {
      const snapshot = await tx.vehicleNavSnapshot.create({
        data: {
          vehicleId,
          asOfDate,
          navAmount,
          currency: currency as Currency,
          source: sourceInput || null,
          createdById: user.id,
        },
      });
      await writeAuditEvent(tx, {
        actorId: user.id,
        action: "vehicle_nav.recorded",
        targetType: "VehicleNavSnapshot",
        targetId: snapshot.id,
      });
    });
  } catch {
    // Covers the (vehicleId, asOfDate) unique-constraint collision alike
    // with any other write failure -- one generic message.
    return { error: "A NAV mark for this vehicle on this date already exists." };
  }

  return { error: null, success: true };
}

// ============================================================
// Investor capital transactions (capital calls, contributions,
// distributions, management fees) -- backfills the dated cash-flow
// history getInvestorReturns' IRR/MOIC calculation needs. Insert-only,
// same discipline as every other financial ledger in this schema (a
// correction is a new row, never an edit; app_runtime_grants.sql grants
// SELECT+INSERT only, no UPDATE).
// ============================================================

const CAPITAL_TRANSACTION_TYPES: InvestorCapitalTransactionType[] = ["CapitalCall", "Contribution", "Distribution", "ManagementFee"];
const MAX_DESCRIPTION_LENGTH = 500;

export async function recordInvestorCapitalTransactionAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  let user;
  let departments: Department[] | null = null;
  try {
    ({ user, departments } = await requireFalakRoleWithDepartmentScope("FALAK_OPERATIONS"));
  } catch (error) {
    if (isAuthError(error)) {
      return { error: GENERIC_ACCESS_DENIED };
    }
    throw error;
  }

  const investorId = readString(formData, "investorId");
  const vehicleIdInput = readString(formData, "vehicleId");
  const type = readString(formData, "type");
  const amount = readAmount(formData, "amount");
  const currency = readString(formData, "currency");
  const transactionDateRaw = readString(formData, "transactionDate");
  const descriptionInput = readString(formData, "description");

  const invalid = checkFields([
    ["investorId", investorId, FIELD.choose],
    ["type", type && CAPITAL_TRANSACTION_TYPES.includes(type as InvestorCapitalTransactionType), FIELD.choose],
    ["amount", amount && AMOUNT_PATTERN.test(amount), FIELD.amount],
    ["currency", currency && CURRENCIES.includes(currency as Currency), FIELD.choose],
    ["transactionDate", isDateInput(transactionDateRaw), FIELD.date],
    ["description", !descriptionInput || descriptionInput.length <= MAX_DESCRIPTION_LENGTH, FIELD.tooLong(MAX_DESCRIPTION_LENGTH)],
  ]);
  if (invalid || !investorId || !type || !amount || !currency || !transactionDateRaw) {
    return invalid ?? { error: GENERIC_ERROR };
  }
  const transactionDate = new Date(transactionDateRaw);
  if (
    !(await investorInDepartment(departments, investorId)) ||
    (vehicleIdInput && !(await vehicleInDepartment(departments, vehicleIdInput)))
  ) {
    return { error: OUT_OF_DEPARTMENT };
  }

  try {
    await db.$transaction(async (tx) => {
      const transaction = await tx.investorCapitalTransaction.create({
        data: {
          investorId,
          vehicleId: vehicleIdInput || null,
          type: type as InvestorCapitalTransactionType,
          amount,
          currency: currency as Currency,
          transactionDate,
          description: descriptionInput || null,
          createdById: user.id,
        },
      });
      await writeAuditEvent(tx, {
        actorId: user.id,
        action: "investor_capital_transaction.recorded",
        targetType: "InvestorCapitalTransaction",
        targetId: transaction.id,
      });
    });
  } catch {
    return { error: GENERIC_ERROR };
  }

  return { error: null, success: true };
}

// ============================================================
// Staff management (invite, department, password, revoke)
// ============================================================

// FALAK_ADMIN is deliberately never an option here -- granting the
// platform-owner tier stays a manual, out-of-band action (not exposed
// through self-service UI, to prevent privilege escalation via this
// form), same reasoning AccessRequestedRole's own self-serve sign-up
// never offers it either.
const INVITABLE_STAFF_ROLES = ["FALAK_MANAGEMENT", "FALAK_OPERATIONS"] as const;
type InvitableStaffRole = (typeof INVITABLE_STAFF_ROLES)[number];

/**
 * Admin-only: directly provisions a Falak-staff account (find-or-create
 * the User by email, grant the role, set the department) and sends them
 * a sign-in link for their first login -- staff accounts are Falak-
 * provisioned, not self-service, so there is no separate invite-token/
 * accept-page flow the way company/investor invites have; the user row
 * and the role grant are created in the same step an invite would
 * otherwise just prepare.
 */
export async function inviteStaffUserAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  let actor;
  try {
    ({ user: actor } = await requireFalakRole("FALAK_ADMIN"));
  } catch (error) {
    if (isAuthError(error)) {
      return { error: GENERIC_ACCESS_DENIED };
    }
    throw error;
  }

  const emailInput = formData.get("email");
  const role = readString(formData, "role");
  const department = readString(formData, "department");

  const invalid = checkFields([
    ["email", typeof emailInput === "string" && emailInput.trim() !== "" && emailInput.length <= MAX_RAW_EMAIL_LENGTH && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailInput.trim()), FIELD.email],
    ["role", role && (INVITABLE_STAFF_ROLES as readonly string[]).includes(role), FIELD.choose],
    ["department", department, FIELD.choose],
    [
      "department",
      !department || parseDepartmentChoice(department, role === "FALAK_MANAGEMENT") !== null,
      department === ALL_DEPARTMENTS_VALUE ? BOTH_DEPARTMENTS_MANAGEMENT_ONLY : FIELD.choose,
    ],
  ]);
  if (invalid || typeof emailInput !== "string" || !role || !department) return invalid ?? { error: GENERIC_ERROR };
  const email = normalizeEmail(emailInput);
  const departmentChoice = parseDepartmentChoice(department, role === "FALAK_MANAGEMENT")!;

  try {
    await db.$transaction(async (tx) => {
      const staffUser = await tx.user.upsert({
        where: { email },
        update: departmentChoice,
        create: { email, ...departmentChoice },
      });

      const existingActiveRole = await tx.userRoleAssignment.findFirst({
        where: { userId: staffUser.id, role: role as InvitableStaffRole, revokedAt: null },
      });
      if (!existingActiveRole) {
        await tx.userRoleAssignment.create({ data: { userId: staffUser.id, role: role as InvitableStaffRole } });
      }

      await writeAuditEvent(tx, {
        actorId: actor.id,
        action: "staff_user.invited",
        targetType: "User",
        targetId: staffUser.id,
      });
    });
  } catch {
    return { error: GENERIC_ERROR };
  }

  // Outside the transaction, same "never let a slow/failed email
  // provider call hold open or roll back a real write" discipline as
  // publish-workflow.ts's own sendPublishNotifications.
  try {
    await requestSignInLink(email);
  } catch {
    return { error: "Staff access was granted, but the sign-in email failed to send. Ask them to use \"Forgot password\" instead." };
  }

  return { error: null, success: true };
}

export async function adminSetStaffDepartmentAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  let actor;
  try {
    ({ user: actor } = await requireFalakRole("FALAK_ADMIN"));
  } catch (error) {
    if (isAuthError(error)) {
      return { error: GENERIC_ACCESS_DENIED };
    }
    throw error;
  }

  const userId = readString(formData, "userId");
  const department = readString(formData, "department");
  const invalid = checkFields([["department", department, FIELD.choose]]);
  if (invalid || !userId || !department) return invalid ?? { error: GENERIC_ERROR };

  // "Both departments" only for someone who currently holds Management.
  const isManagement =
    (await db.userRoleAssignment.findFirst({ where: { userId, role: "FALAK_MANAGEMENT", revokedAt: null }, select: { id: true } })) !== null;
  const departmentChoice = parseDepartmentChoice(department, isManagement);
  if (!departmentChoice) {
    const message = department === ALL_DEPARTMENTS_VALUE ? BOTH_DEPARTMENTS_MANAGEMENT_ONLY : FIELD.choose;
    return { error: message, fieldErrors: { department: message } };
  }

  try {
    await db.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: departmentChoice });
      await writeAuditEvent(tx, {
        actorId: actor.id,
        action: "staff_user.department_changed",
        targetType: "User",
        targetId: userId,
      });
    });
  } catch {
    return { error: GENERIC_ERROR };
  }

  return { error: null, success: true };
}

/**
 * Admin-only password override -- unlike /account's own change-password
 * flow, this never requires or checks the user's OLD password: Admin is
 * setting it directly on their behalf (e.g. because they're locked out),
 * not proving they already know it.
 */
export async function adminSetUserPasswordAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  let actor;
  try {
    ({ user: actor } = await requireFalakRole("FALAK_ADMIN"));
  } catch (error) {
    if (isAuthError(error)) {
      return { error: GENERIC_ACCESS_DENIED };
    }
    throw error;
  }

  const userId = readString(formData, "userId");
  const newPassword = formData.get("newPassword");
  const invalid = checkFields([
    [
      "newPassword",
      typeof newPassword === "string" && newPassword.length >= MIN_PASSWORD_LENGTH && newPassword.length <= MAX_RAW_PASSWORD_LENGTH,
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    ],
  ]);
  if (invalid || !userId || typeof newPassword !== "string") return invalid ?? { error: GENERIC_ERROR };

  const passwordHash = await hashPassword(newPassword);

  try {
    await db.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { passwordHash } });
      await writeAuditEvent(tx, {
        actorId: actor.id,
        action: "staff_user.password_reset_by_admin",
        targetType: "User",
        targetId: userId,
      });
    });
  } catch {
    return { error: GENERIC_ERROR };
  }

  return { error: null, success: true };
}

export async function revokeStaffRoleAction(formData: FormData): Promise<void> {
  let actor;
  try {
    ({ user: actor } = await requireFalakRole("FALAK_ADMIN"));
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      redirect("/sign-in");
    }
    if (error instanceof ForbiddenError) {
      return;
    }
    throw error;
  }

  const userId = readString(formData, "userId");
  const role = readString(formData, "role");
  if (!userId || !role) return;

  await db.$transaction(async (tx) => {
    await tx.userRoleAssignment.updateMany({
      where: { userId, role: role as PlatformRole, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await writeAuditEvent(tx, {
      actorId: actor.id,
      action: "staff_user.role_revoked",
      targetType: "User",
      targetId: userId,
    });
  });
}

// ============================================================
// Delete (hide everywhere; nothing is removed from the database)
// ============================================================

const CONFIRM_NAME_MISMATCH = "Type the exact English name to confirm deletion.";

// The app's database account cannot delete rows by design, so Delete marks
// the record deleted (and archived), frees its slug for reuse, and ends
// any access to it. Every list, page, dashboard, report and export already
// excludes archived/deleted records; the history stays for audit.
const deletedSlug = (slug: string) => `${slug}-deleted-${Date.now().toString(36)}`.slice(0, 120);

/** Deletes a startup from the platform. Admin only. */
export async function deleteCompanyAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  let user;
  try {
    ({ user } = await requireFalakRole("FALAK_ADMIN"));
  } catch (error) {
    if (isAuthError(error)) {
      return { error: GENERIC_ACCESS_DENIED };
    }
    throw error;
  }

  const companyId = readString(formData, "companyId");
  if (!companyId) return { error: GENERIC_ERROR };
  const company = await db.company.findUnique({
    where: { id: companyId },
    select: { nameEn: true, slug: true, archivedAt: true, deletedAt: true },
  });
  if (!company || company.deletedAt) return { error: GENERIC_ERROR };
  if (readString(formData, "confirmName") !== company.nameEn.trim()) {
    return { error: CONFIRM_NAME_MISMATCH, fieldErrors: { confirmName: CONFIRM_NAME_MISMATCH } };
  }

  const now = new Date();
  try {
    await db.$transaction(async (tx) => {
      await tx.company.update({
        where: { id: companyId },
        data: { deletedAt: now, archivedAt: company.archivedAt ?? now, slug: deletedSlug(company.slug) },
      });
      // Nobody keeps access to a deleted startup.
      await tx.companyMembership.updateMany({ where: { companyId, revokedAt: null }, data: { revokedAt: now } });
      await tx.companyInvite.updateMany({ where: { companyId, acceptedAt: null, revokedAt: null }, data: { revokedAt: now } });
      await writeAuditEvent(tx, {
        actorId: user.id,
        action: "company.deleted",
        targetType: "Company",
        targetId: companyId,
        meta: { nameEn: company.nameEn, slug: company.slug },
      });
    });
  } catch (error) {
    console.error("deleteCompanyAction failed", error);
    return { error: GENERIC_ERROR };
  }
  redirect("/admin/manage/new-company");
}

// ============================================================
// Correcting or removing a recorded investment (Admin)
// ============================================================

// The app's database account may change an investment's status but not
// its terms, so a correction ends the old record (Terminated) and records
// the corrected terms as a new one that supersedes it; Remove just ends
// it. Terminated investments count nowhere; history stays for audit.
const INVESTED: ("Active" | "Superseded")[] = ["Active", "Superseded"];

/** Ends a recorded investment so it no longer counts anywhere. Admin only. */
export async function removeInvestmentAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  let user;
  try {
    ({ user } = await requireFalakRole("FALAK_ADMIN"));
  } catch (error) {
    if (isAuthError(error)) return { error: GENERIC_ACCESS_DENIED };
    throw error;
  }
  const agreementId = readString(formData, "agreementId");
  if (!agreementId) return { error: GENERIC_ERROR };

  try {
    const ended = await db.$transaction(async (tx) => {
      const result = await tx.investmentAgreement.updateMany({
        where: { id: agreementId, status: { in: INVESTED } },
        data: { status: "Terminated", effectiveTo: new Date() },
      });
      if (result.count !== 1) return false;
      await writeAuditEvent(tx, {
        actorId: user.id,
        action: "investment_agreement.terminated",
        targetType: "InvestmentAgreement",
        targetId: agreementId,
      });
      return true;
    });
    if (!ended) return { error: "This investment was already removed." };
  } catch (error) {
    console.error("removeInvestmentAction failed", error);
    return { error: GENERIC_ERROR };
  }
  return { error: null, success: true };
}

/** Replaces a recorded investment's amount, currency, date or ownership. Admin only. */
export async function correctInvestmentAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  let user;
  try {
    ({ user } = await requireFalakRole("FALAK_ADMIN"));
  } catch (error) {
    if (isAuthError(error)) return { error: GENERIC_ACCESS_DENIED };
    throw error;
  }
  const agreementId = readString(formData, "agreementId");
  const investedAmount = readAmount(formData, "investedAmount");
  const currency = readString(formData, "currency");
  const ownershipPct = readAmount(formData, "ownershipPct");
  const signedDateRaw = readString(formData, "signedDate");
  const invalid = checkFields([
    ["investedAmount", investedAmount && AMOUNT_PATTERN.test(investedAmount), FIELD.amount],
    ["currency", currency && CURRENCIES.includes(currency as Currency), FIELD.choose],
    ["ownershipPct", !ownershipPct || AMOUNT_PATTERN.test(ownershipPct), "Enter a decimal share, e.g. 0.10 for 10%, or leave it empty."],
    ["signedDate", isDateInput(signedDateRaw), FIELD.date],
  ]);
  if (invalid || !agreementId || !investedAmount || !currency || !signedDateRaw) return invalid ?? { error: GENERIC_ERROR };
  const signedDate = new Date(signedDateRaw);

  try {
    const done = await db.$transaction(async (tx) => {
      const old = await tx.investmentAgreement.findFirst({
        where: { id: agreementId, status: { in: INVESTED } },
        select: { id: true, agreementNumber: true, ownershipPositionId: true, roundLabel: true },
      });
      if (!old) return false;
      const ended = await tx.investmentAgreement.updateMany({
        where: { id: old.id, status: { in: INVESTED } },
        data: { status: "Terminated", effectiveTo: new Date() },
      });
      if (ended.count !== 1) return false;
      const corrected = await tx.investmentAgreement.create({
        data: {
          agreementNumber: `${old.agreementNumber.slice(0, 100)}-c${Date.now().toString(36)}`,
          ownershipPositionId: old.ownershipPositionId,
          roundLabel: old.roundLabel,
          signedDate,
          effectiveFrom: signedDate,
          investedAmount,
          currency: currency as Currency,
          ownershipPct: ownershipPct || null,
          status: "Active",
          supersedesAgreementId: old.id,
        },
      });
      if (ownershipPct) {
        await tx.ownershipSnapshot.create({
          data: { ownershipPositionId: old.ownershipPositionId, asOfDate: signedDate, ownershipPct, source: "admin" },
        });
      }
      await writeAuditEvent(tx, {
        actorId: user.id,
        action: "investment_agreement.corrected",
        targetType: "InvestmentAgreement",
        targetId: corrected.id,
        meta: { replaces: old.id },
      });
      return true;
    });
    if (!done) return { error: "This investment was changed or removed meanwhile. Reload and try again." };
  } catch (error) {
    console.error("correctInvestmentAction failed", error);
    return { error: GENERIC_ERROR };
  }
  return { error: null, success: true };
}

/** Deletes a vehicle from the platform. Admin only. */
export async function deleteVehicleAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  let user;
  try {
    ({ user } = await requireFalakRole("FALAK_ADMIN"));
  } catch (error) {
    if (isAuthError(error)) {
      return { error: GENERIC_ACCESS_DENIED };
    }
    throw error;
  }

  const vehicleId = readString(formData, "vehicleId");
  if (!vehicleId) return { error: GENERIC_ERROR };
  const vehicle = await db.vehicle.findUnique({
    where: { id: vehicleId },
    select: { nameEn: true, slug: true, archivedAt: true, deletedAt: true },
  });
  if (!vehicle || vehicle.deletedAt) return { error: GENERIC_ERROR };
  if (readString(formData, "confirmName") !== vehicle.nameEn.trim()) {
    return { error: CONFIRM_NAME_MISMATCH, fieldErrors: { confirmName: CONFIRM_NAME_MISMATCH } };
  }

  const now = new Date();
  try {
    await db.$transaction(async (tx) => {
      await tx.vehicle.update({
        where: { id: vehicleId },
        data: { deletedAt: now, archivedAt: vehicle.archivedAt ?? now, slug: deletedSlug(vehicle.slug) },
      });
      await writeAuditEvent(tx, {
        actorId: user.id,
        action: "vehicle.deleted",
        targetType: "Vehicle",
        targetId: vehicleId,
        meta: { nameEn: vehicle.nameEn, slug: vehicle.slug },
      });
    });
  } catch (error) {
    console.error("deleteVehicleAction failed", error);
    return { error: GENERIC_ERROR };
  }
  redirect("/admin/manage/new-vehicle");
}

/**
 * Deletes an investor from the platform. Admin only. Its logins and
 * pending invites end, and its open vehicle positions are closed, so it
 * receives no further reports.
 */
export async function deleteInvestorAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  let user;
  try {
    ({ user } = await requireFalakRole("FALAK_ADMIN"));
  } catch (error) {
    if (isAuthError(error)) {
      return { error: GENERIC_ACCESS_DENIED };
    }
    throw error;
  }

  const investorId = readString(formData, "investorId");
  if (!investorId) return { error: GENERIC_ERROR };
  const investor = await db.investor.findUnique({
    where: { id: investorId },
    select: { nameEn: true, archivedAt: true, deletedAt: true },
  });
  if (!investor || investor.deletedAt) return { error: GENERIC_ERROR };
  if (readString(formData, "confirmName") !== investor.nameEn.trim()) {
    return { error: CONFIRM_NAME_MISMATCH, fieldErrors: { confirmName: CONFIRM_NAME_MISMATCH } };
  }

  const now = new Date();
  try {
    await db.$transaction(async (tx) => {
      await tx.investor.update({
        where: { id: investorId },
        data: { deletedAt: now, archivedAt: investor.archivedAt ?? now },
      });
      await tx.investorMembership.updateMany({ where: { investorId, revokedAt: null }, data: { revokedAt: now } });
      await tx.investorInvite.updateMany({ where: { investorId, acceptedAt: null, revokedAt: null }, data: { revokedAt: now } });
      await tx.investorVehiclePosition.updateMany({
        where: { investorId, status: "Active" },
        data: { status: "Exited", effectiveTo: now },
      });
      await writeAuditEvent(tx, {
        actorId: user.id,
        action: "investor.deleted",
        targetType: "Investor",
        targetId: investorId,
        meta: { nameEn: investor.nameEn },
      });
    });
  } catch (error) {
    console.error("deleteInvestorAction failed", error);
    return { error: GENERIC_ERROR };
  }
  redirect("/admin/manage/new-investor");
}

// ============================================================
// Editing a reporting template
// ============================================================

const METRIC_KEY_PATTERN = /^[a-z][a-z0-9_]*$/;

/**
 * Edits to a template that may already be in use: name, on/off, whether
 * it asks for financial statements, and per metric its labels, order,
 * required and on/off. New metrics can be added. A metric's key and data
 * type are free while no startup has answered it; once answered they
 * change only through its Edit button (unlock_<id>), and only where past
 * answers keep reading correctly: a key the charts read stays, and the
 * type moves only among the number types.
 * Templates are shared by all departments; any Falak staff may edit.
 */
export async function updateReportingTemplateAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  let user;
  try {
    ({ user } = await requireFalakRole("FALAK_OPERATIONS"));
  } catch (error) {
    if (isAuthError(error)) {
      return { error: GENERIC_ACCESS_DENIED };
    }
    throw error;
  }

  const values: FormValues = {};
  for (const [k, v] of formData.entries()) if (typeof v === "string") values[k] = v;
  const fail = (error: string): ActionState => ({ error, values });
  const fieldErrors: FieldErrors = {};
  const flag = (field: string, ok: unknown, message: string) => {
    if (!ok && !fieldErrors[field]) fieldErrors[field] = message;
  };

  const templateId = readString(formData, "templateId");
  const nameEn = readString(formData, "nameEn");
  const nameAr = readString(formData, "nameAr");
  if (!templateId) return fail(GENERIC_ERROR);
  flag("nameEn", isValidName(nameEn), FIELD.required);
  flag("nameAr", isValidName(nameAr), FIELD.required);

  const existing = await db.metricDefinition.findMany({
    where: { templateId, deletedAt: null },
    include: { _count: { select: { currentValues: true, snapshotValues: true } } },
  });
  if (existing.length === 0 && !(await db.reportingTemplate.findUnique({ where: { id: templateId } }))) {
    return fail(GENERIC_ERROR);
  }
  // Deleted metrics that already had values keep their key, so it stays taken.
  const deletedKeys = new Set(
    (await db.metricDefinition.findMany({ where: { templateId, deletedAt: { not: null } }, select: { key: true } })).map((m) => m.key)
  );

  const updates: { id: string; data: Record<string, unknown> }[] = [];
  const keys = new Set<string>(deletedKeys);
  const now = new Date();
  for (const m of existing) {
    const hasValues = m._count.currentValues + m._count.snapshotValues > 0;
    const locked = hasValues && formData.get(`unlock_${m.id}`) !== "on";
    // Delete: no row is removed (values already reported keep their
    // history); the metric leaves the template and every form. One that was
    // never answered also frees its key for reuse.
    if (formData.get(`delete_${m.id}`) === "on") {
      updates.push({
        id: m.id,
        data: {
          deletedAt: now,
          isActive: false,
          required: false,
          ...(hasValues ? {} : { key: `${m.key}__deleted_${now.getTime().toString(36)}`.slice(0, 120) }),
        },
      });
      continue;
    }
    const labelEn = readString(formData, `labelEn_${m.id}`);
    const labelAr = readString(formData, `labelAr_${m.id}`);
    const sortOrder = Number(readString(formData, `sortOrder_${m.id}`));
    const key = locked ? m.key : toMetricKey(readString(formData, `key_${m.id}`) ?? "");
    const dataType = locked ? m.dataType : readString(formData, `dataType_${m.id}`);
    flag(`labelEn_${m.id}`, isValidName(labelEn), FIELD.required);
    flag(`labelAr_${m.id}`, isValidName(labelAr), FIELD.required);
    flag(`sortOrder_${m.id}`, Number.isInteger(sortOrder), "Enter a whole number.");
    flag(`key_${m.id}`, key && METRIC_KEY_PATTERN.test(key), "Enter a key, e.g. revenue_b2b.");
    flag(`dataType_${m.id}`, dataType && METRIC_DATA_TYPES.includes(dataType as MetricDataType), FIELD.choose);
    if (hasValues && key !== m.key) {
      flag(`key_${m.id}`, !SYSTEM_METRIC_KEYS.has(m.key), `"${m.key}" feeds the charts and reports, so it keeps its key. Change its labels instead.`);
    }
    if (hasValues && dataType !== m.dataType) {
      flag(
        `dataType_${m.id}`,
        NUMERIC_DATA_TYPES.has(m.dataType) && NUMERIC_DATA_TYPES.has(dataType ?? ""),
        "Startups have answered this metric, so it can only switch between Currency, Percent and Number."
      );
    }
    flag(`key_${m.id}`, !keys.has(key), deletedKeys.has(key) ? `"${key}" belongs to a deleted metric; choose another key.` : `"${key}" is used by another metric.`);
    keys.add(key);
    updates.push({
      id: m.id,
      data: {
        labelEn,
        labelAr,
        sortOrder,
        required: formData.get(`required_${m.id}`) === "on",
        isActive: formData.get(`isActive_${m.id}`) === "on",
        ...(locked ? {} : { key, dataType: dataType as MetricDataType }),
      },
    });
  }

  const added: { key: string; labelEn: string; labelAr: string; dataType: MetricDataType; sortOrder: number }[] = [];
  let nextOrder = Math.max(0, ...existing.map((m) => m.sortOrder)) + 1;
  for (let i = 0; i < MAX_METRIC_ROWS; i++) {
    const rawKey = readString(formData, `newKey_${i}`) ?? "";
    const labelEn = readString(formData, `newLabelEn_${i}`);
    const labelAr = readString(formData, `newLabelAr_${i}`);
    const dataType = readString(formData, `newDataType_${i}`);
    if (!rawKey && !labelEn && !labelAr && !dataType) continue;
    // Same as creating a template: key optional, any spelling normalised.
    const key = toMetricKey(rawKey || labelEn || "");
    flag(`newKey_${i}`, METRIC_KEY_PATTERN.test(key), "Enter a key or an English label.");
    flag(`newLabelEn_${i}`, isValidName(labelEn), FIELD.required);
    flag(`newLabelAr_${i}`, isValidName(labelAr), FIELD.required);
    flag(`newDataType_${i}`, dataType && METRIC_DATA_TYPES.includes(dataType as MetricDataType), FIELD.choose);
    flag(`newKey_${i}`, !keys.has(key), deletedKeys.has(key) ? `"${key}" belongs to a deleted metric; choose another key.` : `"${key}" is used by another metric.`);
    keys.add(key);
    added.push({ key, labelEn: labelEn ?? "", labelAr: labelAr ?? "", dataType: dataType as MetricDataType, sortOrder: nextOrder++ });
  }

  if (Object.keys(fieldErrors).length > 0 || !nameEn || !nameAr) {
    return { error: FIX_HIGHLIGHTED, fieldErrors, values };
  }

  try {
    await db.$transaction(async (tx) => {
      await tx.reportingTemplate.update({
        where: { id: templateId },
        data: {
          nameEn,
          nameAr,
          isActive: formData.get("templateActive") === "on",
          collectFinancialStatements: formData.get("collectFinancialStatements") === "on",
        },
      });
      // Free up keys first, so swapping two unlocked keys can't collide on the unique index.
      for (const u of updates) {
        if ("key" in u.data) await tx.metricDefinition.update({ where: { id: u.id }, data: { key: `__tmp_${u.id}` } });
      }
      for (const u of updates) await tx.metricDefinition.update({ where: { id: u.id }, data: u.data });
      if (added.length > 0) {
        await tx.metricDefinition.createMany({ data: added.map((m) => ({ ...m, templateId, required: true })) });
      }
      await writeAuditEvent(tx, {
        actorId: user.id,
        action: "reporting_template.updated",
        targetType: "ReportingTemplate",
        targetId: templateId,
      });
    });
  } catch {
    return fail(GENERIC_ERROR);
  }

  return { error: null, success: true };
}

/** Saves a startup's report contacts (who its report emails go to, To or Cc). */
export async function saveStartupContactsAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    return await saveStartupContacts(formData);
  } catch (error) {
    if (isAuthError(error)) return { error: GENERIC_ACCESS_DENIED };
    throw error;
  }
}
