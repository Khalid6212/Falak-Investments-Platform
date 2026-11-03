import "server-only";
import { db } from "@/lib/db";
import { requireCurrentUser } from "@/lib/auth/authorization";
import { requireFalakRoleWithDepartmentScope } from "@/lib/auth/department-scope";
import { ForbiddenError } from "@/lib/auth/authorization-errors";
import { fetchSubmissionMetricFields } from "@/lib/reporting/metrics";
import { REVENUE_METRIC_KEYS, sumRevenueMetricValues } from "@/lib/reporting/revenue-metrics";
import type { Currency, CustomerModel, FundingStage, NarrativeKind } from "@/generated/prisma/client";
import type { SubmissionMetricFieldDTO } from "@/lib/reporting/dto";

export interface QuarterlyReportCompanyDTO {
  slug: string;
  nameEn: string;
  nameAr: string;
  sectorEn: string;
  sectorAr: string;
  customerModel: CustomerModel;
  currency: Currency;
  currentStage: FundingStage;
}

export interface QuarterlyReportNarrativeDTO {
  kind: NarrativeKind;
  textEn: string;
  textAr: string;
}

export interface QuarterlyReportData {
  company: QuarterlyReportCompanyDTO;
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  publishedAt: string | null;
  metrics: SubmissionMetricFieldDTO[];
  revenue: number | null;
  // Both null together when the current period has no predecessor cycle
  // at all; previousMetrics specifically null (while previousRevenue is
  // still populated) when a predecessor cycle exists but never had a
  // submission -- same two-states-get-different-handling split
  // CompanyKpis already draws between "no prior period" and "insufficient
  // data."
  previousMetrics: SubmissionMetricFieldDTO[] | null;
  previousRevenue: number | null;
  previousPeriodLabel: string | null;
  narratives: QuarterlyReportNarrativeDTO[];
  reportVersionId: string;
  attachments: { id: string; fileName: string }[];
  // Whether THIS viewer is Falak staff -- controls the attach-a-file
  // control, which only staff may use (an investor sees the same
  // attachments list read-only).
  canManageAttachments: boolean;
}

function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * The branded, investor-shareable one-pager's data -- deliberately only
 * ever resolves for an actually PUBLISHED (isSuperseded: false,
 * publishedAt set) ReportVersion of a given company+period. A draft or
 * in-review submission never has one, by design: this is the formatted
 * artifact handed to Falak/investors, not a live editing surface (that's
 * CompanyReportView/StartupReportForm instead).
 *
 * Access: Falak staff (FALAK_OPERATIONS) can open any company's any
 * published period. Anyone else must hold a non-revoked
 * ReportAccessGrant on this exact ReportVersion through one of their own
 * (non-revoked, non-archived) InvestorMembership rows -- the same grant
 * primitive getInvestorPortfolioData already reads, just checked for one
 * specific version instead of enumerated across all of them. A company's
 * own members are NOT granted access through this function (confirmed
 * scope: this formatted report is for Falak and investors, not a
 * duplicate company-facing view -- CompanyReportView/MetricsBreakdown
 * already cover that).
 *
 * Returns null for an unknown slug, an unknown period, or a period with
 * no published version -- never distinguished from each other, so this
 * never reveals which periods exist to a viewer who isn't authorized to
 * see them. Throws ForbiddenError only once a real, published version
 * has been located and the caller still isn't entitled to it.
 */
export async function getQuarterlyReportData(slug: string, periodKey: string): Promise<QuarterlyReportData | null> {
  const user = await requireCurrentUser();

  const company = await db.company.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      nameEn: true,
      nameAr: true,
      sectorEn: true,
      sectorAr: true,
      customerModel: true,
      currency: true,
      currentStage: true,
      archivedAt: true,
      department: true,
      cycles: {
        where: { archivedAt: null },
        orderBy: { periodStart: "asc" },
        select: {
          id: true,
          templateId: true,
          periodLabel: true,
          periodStart: true,
          periodEnd: true,
          submission: {
            select: {
              id: true,
              metricValues: {
                where: { metricDefinition: { key: { in: REVENUE_METRIC_KEYS } } },
                select: { metricDefinition: { select: { key: true } }, numericValue: true, isNa: true },
              },
            },
          },
        },
      },
      reports: {
        where: { scope: "COMPANY" },
        select: {
          periodStart: true,
          periodEnd: true,
          versions: {
            where: { isSuperseded: false, publishedAt: { not: null } },
            select: {
              id: true,
              publishedAt: true,
              narratives: { select: { kind: true, textEn: true, textAr: true } },
              attachments: { select: { id: true, fileName: true } },
            },
          },
        },
      },
    },
  });

  if (!company || company.archivedAt) return null;

  let cycleIndex = company.cycles.findIndex((c) => c.periodLabel === periodKey);
  if (cycleIndex === -1) {
    // A link sent before the period was renamed still opens its report.
    const renamed = await db.auditEvent.findFirst({
      where: {
        action: "reporting_cycle.renamed",
        targetId: { in: company.cycles.map((c) => c.id) },
        meta: { path: ["previousLabel"], equals: periodKey },
      },
      orderBy: { createdAt: "desc" },
      select: { targetId: true },
    });
    if (renamed) cycleIndex = company.cycles.findIndex((c) => c.id === renamed.targetId);
  }
  if (cycleIndex === -1) return null;
  const cycle = company.cycles[cycleIndex];
  if (!cycle.submission) return null;

  const matchingReport = company.reports.find(
    (r) => toDateOnly(r.periodStart) === toDateOnly(cycle.periodStart) && toDateOnly(r.periodEnd) === toDateOnly(cycle.periodEnd)
  );
  const version = matchingReport?.versions[0];
  if (!version) return null;

  let isAuthorized = false;
  try {
    const scope = await requireFalakRoleWithDepartmentScope("FALAK_OPERATIONS");
    isAuthorized = scope.departments === null || scope.departments.includes(company.department);
  } catch (error) {
    if (!(error instanceof ForbiddenError)) throw error;
  }

  if (!isAuthorized) {
    const investorIds = (
      await db.investorMembership.findMany({
        where: { userId: user.id, revokedAt: null, investor: { archivedAt: null } },
        select: { investorId: true },
      })
    ).map((m) => m.investorId);

    const grant =
      investorIds.length > 0
        ? await db.reportAccessGrant.findFirst({
            where: { reportVersionId: version.id, investorId: { in: investorIds }, revokedAt: null },
            select: { id: true },
          })
        : null;

    if (!grant) throw new ForbiddenError();
  }

  const metrics = await fetchSubmissionMetricFields(db, cycle.submission.id, cycle.templateId);
  const revenue = sumRevenueMetricValues(cycle.submission.metricValues);

  const previousCycle = cycleIndex > 0 ? company.cycles[cycleIndex - 1] : null;
  const previousMetrics = previousCycle?.submission
    ? await fetchSubmissionMetricFields(db, previousCycle.submission.id, previousCycle.templateId)
    : null;
  const previousRevenue = previousCycle?.submission ? sumRevenueMetricValues(previousCycle.submission.metricValues) : null;

  return {
    company: {
      slug: company.slug,
      nameEn: company.nameEn,
      nameAr: company.nameAr,
      sectorEn: company.sectorEn,
      sectorAr: company.sectorAr,
      customerModel: company.customerModel,
      currency: company.currency,
      currentStage: company.currentStage,
    },
    periodLabel: cycle.periodLabel,
    periodStart: toDateOnly(cycle.periodStart),
    periodEnd: toDateOnly(cycle.periodEnd),
    publishedAt: version.publishedAt ? version.publishedAt.toISOString() : null,
    metrics,
    revenue,
    previousMetrics,
    previousRevenue,
    previousPeriodLabel: previousCycle?.periodLabel ?? null,
    narratives: version.narratives,
    reportVersionId: version.id,
    attachments: version.attachments,
    canManageAttachments: isAuthorized,
  };
}
