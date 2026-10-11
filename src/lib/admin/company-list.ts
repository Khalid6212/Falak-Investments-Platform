import "server-only";
import { db } from "@/lib/db";
import { requireFalakRoleWithDepartmentScope } from "@/lib/auth/department-scope";
import { fetchSubmissionMetricFields } from "@/lib/reporting/metrics";
import { findNumericMetricValue } from "@/lib/reporting/metric-format";
import { REVENUE_METRIC_KEYS, sumRevenueMetricValues } from "@/lib/reporting/revenue-metrics";
import { computeGrossMargin } from "@/lib/reporting/computed-metrics";
import type { Currency, CustomerModel, Department, FundingStage } from "@/generated/prisma/client";

const INVESTED_STATUSES = ["Active", "Superseded"] as const;

export interface CompanyListVehicleRef {
  id: string;
  slug: string;
  nameEn: string;
  nameAr: string;
}

export interface CompanyListRow {
  id: string;
  slug: string;
  nameEn: string;
  nameAr: string;
  sectorEn: string;
  sectorAr: string;
  customerModel: CustomerModel;
  currentStage: FundingStage;
  department: Department;
  currency: Currency;
  vehicles: CompanyListVehicleRef[];
  investmentYear: number | null;
  lastReportedPeriodLabel: string | null;
  lastReportedRevenue: number | null;
  lastReportedGrossMargin: number | null;
  lastReportedCashBurn: number | null;
  lastReportedRunwayMonths: number | null;
  lastUpdated: string | null;
  /** Profile last created/edited -- drives the default "recently added or edited" sort. */
  updatedAt: string;
}

function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Falak-staff-only. One row per non-archived company the fund has ever
 * invested in, carrying everything the Company List page needs: its
 * current profile (sector, stage, department), every vehicle it's held
 * through, its first investment year (earliest Active/Superseded
 * agreement's signedDate, same convention as the portfolio overview
 * dashboard's startup-count series), and the last REPORTED quarter's
 * core metrics -- revenue, gross margin, cash burn, runway -- taken
 * from the most recent cycle that actually has a submitted (non-draft)
 * submission, never the most recent cycle regardless of status (an
 * open, unsubmitted cycle has nothing to report yet).
 */
export async function getCompanyListData(): Promise<CompanyListRow[]> {
  // Every Falak staff role (Investment Professionals included), each
  // limited to their own department; Admin sees all.
  const scope = await requireFalakRoleWithDepartmentScope("FALAK_OPERATIONS");

  const companies = await db.company.findMany({
    where: { archivedAt: null, ...(scope.departments ? { department: { in: scope.departments } } : {}) },
    orderBy: { nameEn: "asc" },
    select: {
      id: true,
      slug: true,
      nameEn: true,
      nameAr: true,
      sectorEn: true,
      sectorAr: true,
      customerModel: true,
      currentStage: true,
      department: true,
      currency: true,
      updatedAt: true,
      ownershipPositions: {
        where: { vehicle: { archivedAt: null } },
        select: {
          vehicle: { select: { id: true, slug: true, nameEn: true, nameAr: true } },
          agreements: {
            where: { status: { in: [...INVESTED_STATUSES] } },
            select: { signedDate: true },
          },
        },
      },
      cycles: {
        orderBy: { periodStart: "desc" },
        select: {
          periodLabel: true,
          templateId: true,
          submission: { select: { id: true, status: true, updatedAt: true, metricValues: { where: { metricDefinition: { key: { in: REVENUE_METRIC_KEYS } } }, select: { metricDefinition: { select: { key: true } }, numericValue: true, isNa: true } } } },
        },
      },
    },
  });

  return Promise.all(
    companies.map(async (company) => {
      const vehicles: CompanyListVehicleRef[] = [];
      const seenVehicleIds = new Set<string>();
      let investmentYear: number | null = null;

      for (const position of company.ownershipPositions) {
        if (position.vehicle && !seenVehicleIds.has(position.vehicle.id)) {
          seenVehicleIds.add(position.vehicle.id);
          vehicles.push(position.vehicle);
        }
        for (const agreement of position.agreements) {
          const year = agreement.signedDate.getFullYear();
          if (investmentYear === null || year < investmentYear) investmentYear = year;
        }
      }

      const lastReportedCycle = company.cycles.find((c) => c.submission && c.submission.status !== "draft");

      let lastReportedRevenue: number | null = null;
      let lastReportedGrossMargin: number | null = null;
      let lastReportedCashBurn: number | null = null;
      let lastReportedRunwayMonths: number | null = null;
      let lastUpdated: string | null = null;

      if (lastReportedCycle?.submission) {
        const submission = lastReportedCycle.submission;
        lastReportedRevenue = sumRevenueMetricValues(submission.metricValues);
        const metrics = await fetchSubmissionMetricFields(db, submission.id, lastReportedCycle.templateId);
        const cogs = findNumericMetricValue(metrics, "fin_cogs");
        lastReportedGrossMargin = computeGrossMargin(lastReportedRevenue, cogs);
        lastReportedCashBurn = findNumericMetricValue(metrics, "fin_burn_rate");
        lastReportedRunwayMonths = findNumericMetricValue(metrics, "fin_runway_months");
        lastUpdated = toDateOnly(submission.updatedAt);
      }

      return {
        id: company.id,
        slug: company.slug,
        nameEn: company.nameEn,
        nameAr: company.nameAr,
        sectorEn: company.sectorEn,
        sectorAr: company.sectorAr,
        customerModel: company.customerModel,
        currentStage: company.currentStage,
        department: company.department,
        currency: company.currency,
        vehicles,
        investmentYear,
        lastReportedPeriodLabel: lastReportedCycle?.periodLabel ?? null,
        lastReportedRevenue,
        lastReportedGrossMargin,
        lastReportedCashBurn,
        lastReportedRunwayMonths,
        lastUpdated,
        updatedAt: company.updatedAt.toISOString(),
      };
    })
  );
}
