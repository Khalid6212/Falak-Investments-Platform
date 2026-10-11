import "server-only";
import { db } from "@/lib/db";
import { requireFalakRoleWithDepartmentScope } from "@/lib/auth/department-scope";
import { ForbiddenError } from "@/lib/auth/authorization-errors";
import type { Currency, ExposureScope, InvestorParticipation } from "@/generated/prisma/client";

export interface ExposureStartupRow {
  companyId: string;
  companySlug: string;
  companyNameEn: string;
  companyNameAr: string;
  /** The active startup-level exposure, when there is one. */
  exposure: {
    id: string;
    investedAmount: number | null;
    currency: Currency | null;
    ownershipPct: number | null;
    participation: InvestorParticipation | null;
  } | null;
}

export interface PositionExposureData {
  positionId: string;
  investorNameEn: string;
  investorNameAr: string;
  vehicleNameEn: string;
  vehicleNameAr: string;
  vehicleSlug: string;
  currency: Currency;
  exposureScope: ExposureScope;
  startups: ExposureStartupRow[];
}

/**
 * One investor-vehicle position with every startup its vehicle holds and
 * the investor's startup-level exposure to each. Staff, same department
 * rules as assigning investors to vehicles. Null when the position isn't
 * active or doesn't exist.
 */
export async function getPositionExposure(positionId: string): Promise<PositionExposureData | null> {
  const { departments } = await requireFalakRoleWithDepartmentScope("FALAK_OPERATIONS");
  const position = await db.investorVehiclePosition.findFirst({
    where: { id: positionId, status: "Active" },
    select: {
      id: true,
      currency: true,
      exposureScope: true,
      vehicleId: true,
      investor: { select: { nameEn: true, nameAr: true, department: true } },
      vehicle: { select: { nameEn: true, nameAr: true, slug: true, department: true } },
      startupExposures: {
        where: { status: "Active" },
        select: { id: true, companyId: true, investedAmount: true, currency: true, ownershipPct: true, participation: true },
      },
    },
  });
  if (!position) return null;
  if (departments && (!departments.includes(position.investor.department) || !departments.includes(position.vehicle.department))) {
    throw new ForbiddenError();
  }

  const holdings = await db.ownershipPosition.findMany({
    where: { vehicleId: position.vehicleId, holderType: "VEHICLE", company: { archivedAt: null } },
    select: { company: { select: { id: true, slug: true, nameEn: true, nameAr: true } } },
    orderBy: { company: { nameEn: "asc" } },
  });
  const seen = new Set<string>();
  const startups: ExposureStartupRow[] = [];
  for (const { company } of holdings) {
    if (seen.has(company.id)) continue;
    seen.add(company.id);
    const e = position.startupExposures.find((x) => x.companyId === company.id);
    startups.push({
      companyId: company.id,
      companySlug: company.slug,
      companyNameEn: company.nameEn,
      companyNameAr: company.nameAr,
      exposure: e
        ? {
            id: e.id,
            investedAmount: e.investedAmount?.toNumber() ?? null,
            currency: e.currency,
            ownershipPct: e.ownershipPct?.toNumber() ?? null,
            participation: e.participation,
          }
        : null,
    });
  }

  return {
    positionId: position.id,
    investorNameEn: position.investor.nameEn,
    investorNameAr: position.investor.nameAr,
    vehicleNameEn: position.vehicle.nameEn,
    vehicleNameAr: position.vehicle.nameAr,
    vehicleSlug: position.vehicle.slug,
    currency: position.currency,
    exposureScope: position.exposureScope,
    startups,
  };
}
