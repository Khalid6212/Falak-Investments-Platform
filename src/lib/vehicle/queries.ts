import "server-only";
import { db } from "@/lib/db";
import { requireFalakRoleWithDepartmentScope } from "@/lib/auth/department-scope";
import { REVENUE_METRIC_KEYS, sumRevenueMetricValues } from "@/lib/reporting/revenue-metrics";
import type {
  VehicleDirectoryEntryDTO,
  VehicleDashboardData,
  VehicleDashboardPeriodOption,
  VehicleCompanyDTO,
  VehicleCompanyPeriodData,
  VehicleInvestorDTO,
} from "./dto";

function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Every non-archived vehicle with its distinct count of linked,
 * non-archived companies and currently-Active, non-archived investors.
 * Falak-staff-only: there is no per-vehicle membership model, so
 * requireFalakRole is the only gate that can apply.
 */
export async function getVehicleDirectoryData(): Promise<VehicleDirectoryEntryDTO[]> {
  const scope = await requireFalakRoleWithDepartmentScope("FALAK_OPERATIONS");

  const vehicles = await db.vehicle.findMany({
    where: { archivedAt: null, ...(scope.departments ? { department: { in: scope.departments } } : {}) },
    orderBy: { nameEn: "asc" },
    select: {
      id: true,
      slug: true,
      nameEn: true,
      nameAr: true,
      type: true,
      currency: true,
      descriptionEn: true,
      descriptionAr: true,
      ownershipPositions: {
        where: { holderType: "VEHICLE", company: { archivedAt: null } },
        select: { companyId: true },
      },
      positions: {
        where: { status: "Active", investor: { archivedAt: null } },
        select: { investorId: true },
      },
    },
  });

  // Counted by distinct id: InvestorVehiclePosition allows several Active
  // rows per (investor, vehicle) at different effectiveFrom dates, and a
  // company could in principle hold more than one VEHICLE position.
  return vehicles.map((v) => ({
    id: v.id,
    slug: v.slug,
    nameEn: v.nameEn,
    nameAr: v.nameAr,
    type: v.type,
    currency: v.currency,
    descriptionEn: v.descriptionEn,
    descriptionAr: v.descriptionAr,
    companyCount: new Set(v.ownershipPositions.map((p) => p.companyId)).size,
    investorCount: new Set(v.positions.map((p) => p.investorId)).size,
  }));
}

/**
 * One vehicle's dashboard: its linked companies (with every vehicle
 * period's live submission status/revenue), its currently-Active
 * investors, and the periods any of its companies has a real cycle for.
 * Returns null for an unknown slug. Archived vehicles still render --
 * admin tables can link to one, and Falak staff may need its history.
 */
export async function getVehicleDashboardData(slug: string): Promise<VehicleDashboardData | null> {
  const scope = await requireFalakRoleWithDepartmentScope("FALAK_OPERATIONS");

  const vehicle = await db.vehicle.findFirst({
    where: { slug, deletedAt: null },
    select: {
      id: true,
      slug: true,
      nameEn: true,
      nameAr: true,
      type: true,
      currency: true,
      descriptionEn: true,
      descriptionAr: true,
      department: true,
      ownershipPositions: {
        where: { holderType: "VEHICLE", company: { archivedAt: null } },
        select: {
          company: {
            select: {
              id: true,
              slug: true,
              nameEn: true,
              nameAr: true,
              sectorEn: true,
              sectorAr: true,
              customerModel: true,
              revenueModels: true,
              currency: true,
              entryStage: true,
              currentStage: true,
              cycles: {
                where: { archivedAt: null },
                select: {
                  periodLabel: true,
                  periodStart: true,
                  periodEnd: true,
                  currentDeadline: true,
                  submission: {
                    select: {
                      status: true,
                      updatedAt: true,
                      metricValues: {
                        where: { metricDefinition: { key: { in: REVENUE_METRIC_KEYS } } },
                        select: { metricDefinition: { select: { key: true } }, numericValue: true, isNa: true },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      positions: {
        where: { status: "Active", investor: { archivedAt: null } },
        select: { investor: { select: { id: true, nameEn: true, nameAr: true, type: true } } },
      },
    },
  });

  if (!vehicle) return null;
  if (scope.departments && !scope.departments.includes(vehicle.department)) {
    // Out-of-department staff gets the same "unknown slug" null as a
    // truly nonexistent vehicle -- never a distinguishable ForbiddenError,
    // same discipline as getCompanyReportData.
    return null;
  }

  const seenCompanyIds = new Set<string>();
  const linkedCompanies: (typeof vehicle.ownershipPositions)[number]["company"][] = [];
  for (const position of vehicle.ownershipPositions) {
    if (seenCompanyIds.has(position.company.id)) continue;
    seenCompanyIds.add(position.company.id);
    linkedCompanies.push(position.company);
  }

  const periodMap = new Map<string, VehicleDashboardPeriodOption>();
  for (const company of linkedCompanies) {
    for (const cycle of company.cycles) {
      if (!periodMap.has(cycle.periodLabel)) {
        periodMap.set(cycle.periodLabel, {
          key: cycle.periodLabel,
          label: cycle.periodLabel,
          periodStart: toDateOnly(cycle.periodStart),
          periodEnd: toDateOnly(cycle.periodEnd),
        });
      }
    }
  }
  const periods = [...periodMap.values()].sort((a, b) => a.periodStart.localeCompare(b.periodStart));

  const companies: VehicleCompanyDTO[] = linkedCompanies.map((company) => {
    const periodsData: Record<string, VehicleCompanyPeriodData> = {};
    for (const period of periods) {
      periodsData[period.key] = { status: "draft", revenue: null, lastUpdated: null, currentDeadline: null };
    }
    for (const cycle of company.cycles) {
      const submission = cycle.submission;
      periodsData[cycle.periodLabel] = {
        status: submission?.status ?? "draft",
        revenue: submission ? sumRevenueMetricValues(submission.metricValues) : null,
        lastUpdated: submission ? toDateOnly(submission.updatedAt) : null,
        currentDeadline: toDateOnly(cycle.currentDeadline),
      };
    }
    return {
      id: company.id,
      slug: company.slug,
      nameEn: company.nameEn,
      nameAr: company.nameAr,
      sectorEn: company.sectorEn,
      sectorAr: company.sectorAr,
      customerModel: company.customerModel,
      revenueModels: company.revenueModels,
      currency: company.currency,
      entryStage: company.entryStage,
      currentStage: company.currentStage,
      periods: periodsData,
    };
  });

  // InvestorVehiclePosition's unique constraint is
  // [investorId, vehicleId, effectiveFrom] -- two Active rows can exist
  // for the same investor on this vehicle (e.g. a commitment increase).
  const seenInvestorIds = new Set<string>();
  const investors: VehicleInvestorDTO[] = [];
  for (const position of vehicle.positions) {
    if (seenInvestorIds.has(position.investor.id)) continue;
    seenInvestorIds.add(position.investor.id);
    investors.push(position.investor);
  }

  return {
    vehicle: {
      id: vehicle.id,
      slug: vehicle.slug,
      nameEn: vehicle.nameEn,
      nameAr: vehicle.nameAr,
      type: vehicle.type,
      currency: vehicle.currency,
      descriptionEn: vehicle.descriptionEn,
      descriptionAr: vehicle.descriptionAr,
    },
    periods,
    companies,
    investors,
  };
}
