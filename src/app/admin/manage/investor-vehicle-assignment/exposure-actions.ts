"use server";

import { db } from "@/lib/db";
import type { Currency, Department, ExposureScope, InvestorParticipation, Prisma } from "@/generated/prisma/client";
import { requireFalakRoleWithDepartmentScope } from "@/lib/auth/department-scope";
import { isAuthError, GENERIC_ACCESS_DENIED } from "@/lib/auth/action-error";
import { writeAuditEvent } from "@/lib/audit/write-audit-event";

export interface ExposureFormState {
  error: string | null;
  fieldErrors?: Record<string, string>;
  success?: boolean;
}

const AMOUNT = /^\d+(\.\d{1,4})?$/;
const CURRENCIES: Currency[] = ["SAR", "USD"];
const PARTICIPATIONS: InvestorParticipation[] = ["NETWORK_MEMBER", "SYNDICATE_MEMBER", "FALAK_TEAM", "FALAK"];
const SCOPES: ExposureScope[] = ["ALL_STARTUPS", "SELECTED"];
const GENERIC_ERROR = "Something went wrong. Check your input and try again.";

const read = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim() : "";
};
const amount = (fd: FormData, k: string) => read(fd, k).replace(/[,\s]/g, "");

interface Terms {
  investedAmount: string | null;
  currency: Currency | null;
  ownershipPct: string | null;
  participation: InvestorParticipation | null;
}

const sameTerms = (
  a: Terms,
  b: { investedAmount: Prisma.Decimal | null; currency: Currency | null; ownershipPct: Prisma.Decimal | null; participation: InvestorParticipation | null }
) =>
  (a.investedAmount === null ? b.investedAmount === null : b.investedAmount !== null && Number(a.investedAmount) === b.investedAmount.toNumber()) &&
  a.currency === b.currency &&
  (a.ownershipPct === null ? b.ownershipPct === null : b.ownershipPct !== null && Number(a.ownershipPct) === b.ownershipPct.toNumber()) &&
  a.participation === b.participation;

/**
 * Saves which startups an investor is exposed to through one vehicle
 * position, and their amount / currency / ownership / label per startup.
 * Startup-level rows are never edited in place: a change ends the old row
 * and adds a new one. Newly exposed startups also get access to their
 * already-published reports (like assigning an investor to a vehicle);
 * removing a startup stops future reports but leaves past ones visible,
 * the same as unassigning an investor from a vehicle.
 */
export async function saveInvestorExposuresAction(positionId: string, _prev: ExposureFormState, formData: FormData): Promise<ExposureFormState> {
  let user;
  let departments: Department[] | null = null;
  try {
    ({ user, departments } = await requireFalakRoleWithDepartmentScope("FALAK_OPERATIONS"));
  } catch (error) {
    if (isAuthError(error)) return { error: GENERIC_ACCESS_DENIED };
    throw error;
  }

  const position = await db.investorVehiclePosition.findFirst({
    where: { id: positionId, status: "Active" },
    select: {
      id: true,
      investorId: true,
      vehicleId: true,
      exposureScope: true,
      investor: { select: { department: true } },
      vehicle: { select: { department: true } },
      startupExposures: {
        where: { status: "Active" },
        select: { id: true, companyId: true, investedAmount: true, currency: true, ownershipPct: true, participation: true },
      },
    },
  });
  if (!position) return { error: GENERIC_ERROR };
  if (departments && (!departments.includes(position.investor.department) || !departments.includes(position.vehicle.department))) {
    return { error: "You can only manage records in your own department." };
  }

  const scopeRaw = read(formData, "exposureScope");
  const scope = SCOPES.find((s) => s === scopeRaw);
  if (!scope) return { error: "Choose which startups this investor is exposed to.", fieldErrors: { exposureScope: "Choose an option." } };

  const holdings = await db.ownershipPosition.findMany({
    where: { vehicleId: position.vehicleId, holderType: "VEHICLE", company: { archivedAt: null } },
    select: { companyId: true },
  });
  const companyIds = [...new Set(holdings.map((h) => h.companyId))];

  // Read and check every startup row before writing anything.
  const fieldErrors: Record<string, string> = {};
  const wanted = new Map<string, Terms>();
  for (const companyId of companyIds) {
    const included = scope === "ALL_STARTUPS" || formData.get(`include_${companyId}`) !== null;
    const investedAmount = amount(formData, `amount_${companyId}`) || null;
    const currencyRaw = read(formData, `currency_${companyId}`);
    const ownershipPct = amount(formData, `pct_${companyId}`) || null;
    const participationRaw = read(formData, `participation_${companyId}`);
    const hasDetails = Boolean(investedAmount || ownershipPct || participationRaw);
    if (!included) continue;
    // Under "all startups", a row only exists when it adds detail.
    if (scope === "ALL_STARTUPS" && !hasDetails) continue;

    if (investedAmount && !AMOUNT.test(investedAmount)) fieldErrors[`amount_${companyId}`] = "Enter an amount, e.g. 250000.";
    const currency = CURRENCIES.find((c) => c === currencyRaw) ?? null;
    if (investedAmount && !currency) fieldErrors[`currency_${companyId}`] = "Choose the currency.";
    if (ownershipPct && !AMOUNT.test(ownershipPct)) fieldErrors[`pct_${companyId}`] = "Enter a decimal share, e.g. 0.05 for 5%.";
    const participation = PARTICIPATIONS.find((p) => p === participationRaw) ?? null;
    if (participationRaw && !participation) fieldErrors[`participation_${companyId}`] = "Choose an option.";
    wanted.set(companyId, { investedAmount, currency, ownershipPct, participation });
  }
  if (Object.keys(fieldErrors).length > 0) {
    return { error: "Fix the highlighted fields and try again. Nothing was saved.", fieldErrors };
  }

  const now = new Date();
  const today = new Date(now.toISOString().slice(0, 10));
  try {
    await db.$transaction(async (tx) => {
      if (scope !== position.exposureScope) {
        await tx.investorVehiclePosition.update({ where: { id: position.id }, data: { exposureScope: scope } });
      }

      const newlyExposed: string[] = [];
      for (const companyId of companyIds) {
        const current = position.startupExposures.find((e) => e.companyId === companyId) ?? null;
        const terms = wanted.get(companyId) ?? null;
        if (current && terms && sameTerms(terms, current)) continue;
        if (current) {
          await tx.investorStartupExposure.update({ where: { id: current.id }, data: { status: "Exited", effectiveTo: today } });
        }
        if (terms) {
          await tx.investorStartupExposure.create({
            data: {
              positionId: position.id,
              investorId: position.investorId,
              companyId,
              investedAmount: terms.investedAmount,
              currency: terms.currency,
              ownershipPct: terms.ownershipPct,
              participation: terms.participation,
              effectiveFrom: today,
              status: "Active",
            },
          });
          if (!current) newlyExposed.push(companyId);
        }
      }

      // Switching to "all startups" exposes every startup; otherwise only
      // the newly ticked ones need their past reports shared.
      const grantFor = scope === "ALL_STARTUPS" && position.exposureScope !== "ALL_STARTUPS" ? companyIds : scope === "SELECTED" ? newlyExposed : [];
      if (grantFor.length > 0) {
        const versions = await tx.reportVersion.findMany({
          where: { isSuperseded: false, report: { scope: "COMPANY", companyId: { in: grantFor } } },
          select: { id: true },
        });
        for (const v of versions) {
          await tx.reportAccessGrant.upsert({
            where: { reportVersionId_investorId: { reportVersionId: v.id, investorId: position.investorId } },
            update: {},
            create: { reportVersionId: v.id, investorId: position.investorId },
          });
        }
      }

      await writeAuditEvent(tx, {
        actorId: user.id,
        action: "investor_exposure.updated",
        targetType: "InvestorVehiclePosition",
        targetId: position.id,
        meta: { exposureScope: scope, startups: [...wanted.keys()] },
      });
    });
  } catch (error) {
    console.error("saveInvestorExposuresAction failed", error);
    return { error: GENERIC_ERROR };
  }
  return { error: null, success: true };
}
