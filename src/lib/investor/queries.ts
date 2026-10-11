import "server-only";
import { db } from "@/lib/db";
import { requireCurrentUser } from "@/lib/auth/authorization";
import { REVENUE_METRIC_KEYS, sumRevenueMetricValues } from "@/lib/reporting/revenue-metrics";
import { convertToDisplay } from "@/lib/currency/convert";
import type { Currency } from "@/generated/prisma/client";
import type {
  InvestorPortfolioData,
  InvestorOrgOption,
  InvestorPeriodOption,
  InvestorVisibleCompanyDTO,
  InvestorVehicleExposureDTO,
  InvestorNewsItemDTO,
} from "./dto";

function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * One server-side fetch for the whole /investor page. Requires only an
 * authenticated user -- NOT requireInvestorMembership, which needs one
 * investorId up front and is the wrong shape for "enumerate this user's
 * own orgs." A user with zero investor memberships is a valid empty
 * state (every array empty), not a thrown ForbiddenError.
 *
 * Everything below is scoped from this exact user's own
 * InvestorMembership rows -- never a client-supplied investor id -- so
 * there is no cross-user or cross-org leakage vector: the client only
 * ever filters what this one fetch already returned.
 */
export async function getInvestorPortfolioData(): Promise<InvestorPortfolioData> {
  const user = await requireCurrentUser();

  const memberships = await db.investorMembership.findMany({
    where: { userId: user.id, revokedAt: null, investor: { archivedAt: null } },
    select: { investorId: true, investor: { select: { nameEn: true, nameAr: true } } },
  });

  if (memberships.length === 0) {
    return { orgs: [], periods: [], companies: [], vehicleExposures: [], news: [] };
  }

  const orgs: InvestorOrgOption[] = memberships.map((m) => ({
    id: m.investorId,
    nameEn: m.investor.nameEn,
    nameAr: m.investor.nameAr,
  }));
  const investorIds = memberships.map((m) => m.investorId);

  const grants = await db.reportAccessGrant.findMany({
    where: {
      investorId: { in: investorIds },
      revokedAt: null,
      reportVersion: { report: { scope: "COMPANY", company: { archivedAt: null } } },
    },
    select: {
      investorId: true,
      reportVersion: {
        select: {
          id: true,
          versionNo: true,
          publishedAt: true,
          narratives: {
            where: { kind: "investment_review_notes" },
            select: { textEn: true, textAr: true },
          },
          report: {
            select: {
              id: true,
              periodLabel: true,
              periodStart: true,
              periodEnd: true,
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
                },
              },
            },
          },
          submissions: {
            select: {
              submission: {
                select: {
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
  });

  // Keep only the highest-versionNo grant per (investorId, reportId) --
  // ReportAccessGrant is never revoked or migrated when a report is
  // superseded (publishSubmission only ever creates grants), so an
  // investor can hold two simultaneous non-revoked grants on two
  // different versions of the same report. Their own latest-visible
  // version wins.
  const bestGrantByKey = new Map<string, (typeof grants)[number]>();
  for (const grant of grants) {
    const key = `${grant.investorId}:${grant.reportVersion.report.id}`;
    const existing = bestGrantByKey.get(key);
    if (!existing || grant.reportVersion.versionNo > existing.reportVersion.versionNo) {
      bestGrantByKey.set(key, grant);
    }
  }

  const periodMap = new Map<string, InvestorPeriodOption>();
  const companies: InvestorVisibleCompanyDTO[] = [];
  // Latest report per (org, startup), for the news feed.
  const latestByOrgCompany = new Map<string, (typeof grants)[number]>();

  for (const grant of bestGrantByKey.values()) {
    const { report, submissions, publishedAt } = grant.reportVersion;
    const { company } = report;

    if (!periodMap.has(report.periodLabel)) {
      periodMap.set(report.periodLabel, {
        key: report.periodLabel,
        label: report.periodLabel,
        periodStart: toDateOnly(report.periodStart),
        periodEnd: toDateOnly(report.periodEnd),
      });
    }

    // Report.company is nullable in the schema (a VEHICLE/
    // INVESTOR_PORTFOLIO/FALAK_PORTFOLIO-scope report has none) -- the
    // query's own `where: {scope: "COMPANY"}` guarantees it's set here,
    // but TS can't infer that from a runtime filter, and a future
    // scope-leakage bug should skip the row, not crash the dashboard.
    if (!company) continue;

    const newsKey = `${grant.investorId}:${company.id}`;
    const latest = latestByOrgCompany.get(newsKey);
    if (!latest || report.periodStart > latest.reportVersion.report.periodStart) {
      latestByOrgCompany.set(newsKey, grant);
    }

    // A COMPANY-scope ReportVersion compiles exactly one submission (see
    // ReportVersionSubmission's schema comment) -- guarded defensively
    // rather than trusted blindly, so a future scope-leakage bug skips
    // the row instead of crashing the dashboard.
    if (submissions.length !== 1) continue;
    const revenue = sumRevenueMetricValues(submissions[0].submission.metricValues);

    companies.push({
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
      revenue,
      lastUpdated: publishedAt ? toDateOnly(publishedAt) : toDateOnly(new Date()),
      periodKey: report.periodLabel,
      investorOrgId: grant.investorId,
    });
  }

  const periods = [...periodMap.values()].sort((a, b) => a.periodStart.localeCompare(b.periodStart));

  // Only the latest report counts: a startup whose latest report has no
  // Investment Review Notes has no news, rather than showing older notes.
  const news: InvestorNewsItemDTO[] = [];
  for (const grant of latestByOrgCompany.values()) {
    const { report, publishedAt, narratives } = grant.reportVersion;
    const note = narratives[0];
    if (!report.company || !note || (!note.textEn.trim() && !note.textAr.trim())) continue;
    news.push({
      investorOrgId: grant.investorId,
      companyId: report.company.id,
      companySlug: report.company.slug,
      companyNameEn: report.company.nameEn,
      companyNameAr: report.company.nameAr,
      periodKey: report.periodLabel,
      publishedAt: publishedAt ? publishedAt.toISOString() : null,
      textEn: note.textEn,
      textAr: note.textAr,
    });
  }
  news.sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));

  // Vehicle exposure is independent of report-visibility -- it's the
  // investor's capital exposure structure, resolved the same way
  // publishSubmission's resolveInvestorExposure works in reverse.
  const vehiclePositions = await db.investorVehiclePosition.findMany({
    where: { investorId: { in: investorIds }, status: "Active" },
    select: {
      investorId: true,
      vehicleId: true,
      exposureScope: true,
      startupExposures: { where: { status: "Active" }, select: { companyId: true } },
    },
  });

  // Per (investor, vehicle): null = every startup in the vehicle; otherwise
  // the startups they were selected for. Several positions on one vehicle
  // combine: any "all startups" position wins, else the union.
  const exposedCompanies = new Map<string, Set<string> | null>();
  for (const p of vehiclePositions) {
    const key = `${p.investorId}:${p.vehicleId}`;
    if (p.exposureScope === "ALL_STARTUPS" || exposedCompanies.get(key) === null) {
      exposedCompanies.set(key, null);
      continue;
    }
    const set = exposedCompanies.get(key) ?? new Set<string>();
    for (const e of p.startupExposures) set.add(e.companyId);
    exposedCompanies.set(key, set);
  }

  // InvestorVehiclePosition's unique constraint is
  // [investorId, vehicleId, effectiveFrom] -- two Active rows can exist
  // for the same vehicle (e.g. a commitment increase) -- dedupe
  // explicitly by (investorId, vehicleId).
  const seenExposureKeys = new Set<string>();
  const dedupedPositions: { investorId: string; vehicleId: string }[] = [];
  for (const p of vehiclePositions) {
    const key = `${p.investorId}:${p.vehicleId}`;
    if (seenExposureKeys.has(key)) continue;
    seenExposureKeys.add(key);
    dedupedPositions.push(p);
  }

  const vehicleIds = [...new Set(dedupedPositions.map((p) => p.vehicleId))];
  const [vehicles, ownershipLinks, allVehiclePositions, navSnapshots] = await Promise.all([
    vehicleIds.length
      ? db.vehicle.findMany({
          where: { id: { in: vehicleIds }, archivedAt: null },
          select: { id: true, slug: true, nameEn: true, nameAr: true, type: true, currency: true },
        })
      : Promise.resolve([]),
    // Company name/slug fetched here too (not just companyId) -- the
    // vehicle exposure card lists every startup the vehicle holds by
    // name, regardless of whether a report has ever been published for
    // it yet; an investor assigned to a vehicle should see what's IN
    // it immediately, not an empty-looking card until the first publish.
    vehicleIds.length
      ? db.ownershipPosition.findMany({
          where: { vehicleId: { in: vehicleIds }, holderType: "VEHICLE", company: { archivedAt: null } },
          select: {
            vehicleId: true,
            company: { select: { id: true, slug: true, nameEn: true, nameAr: true, sectorEn: true, sectorAr: true } },
          },
        })
      : Promise.resolve([]),
    // Every investor's Active position on these vehicles -- needed only
    // to compute this org's ownership share; other investors' amounts
    // never leave this function.
    vehicleIds.length
      ? db.investorVehiclePosition.findMany({
          where: { vehicleId: { in: vehicleIds }, status: "Active", investor: { archivedAt: null } },
          select: { investorId: true, vehicleId: true, commitmentAmount: true, currency: true },
        })
      : Promise.resolve([]),
    vehicleIds.length
      ? db.vehicleNavSnapshot.findMany({
          where: { vehicleId: { in: vehicleIds } },
          orderBy: { asOfDate: "asc" },
          select: { vehicleId: true, asOfDate: true, navAmount: true, currency: true },
        })
      : Promise.resolve([]),
  ]);
  const vehicleById = new Map(vehicles.map((v) => [v.id, v]));

  const vehicleExposures: InvestorVehicleExposureDTO[] = [];
  for (const position of dedupedPositions) {
    const vehicle = vehicleById.get(position.vehicleId);
    if (!vehicle) continue;

    const seenCompanyIds = new Set<string>();
    const exposedHere = exposedCompanies.get(`${position.investorId}:${vehicle.id}`) ?? null;
    const linkedCompanies = ownershipLinks
      .filter((l) => l.vehicleId === vehicle.id)
      .map((l) => l.company)
      .filter((c) => exposedHere === null || exposedHere.has(c.id))
      .filter((c) => {
        if (seenCompanyIds.has(c.id)) return false;
        seenCompanyIds.add(c.id);
        return true;
      });

    const vehiclePositionsHere = allVehiclePositions.filter(
      (p) => p.vehicleId === vehicle.id && p.commitmentAmount !== null
    );
    const contributions = vehiclePositionsHere
      .filter((p) => p.investorId === position.investorId)
      .map((p) => ({ amount: p.commitmentAmount!.toNumber(), currency: p.currency }));
    const inVehicleCurrency = (amounts: { amount: number; currency: Currency }[]) =>
      amounts.reduce((s, a) => s + convertToDisplay(a.amount, a.currency, vehicle.currency), 0);
    const totalContributed = inVehicleCurrency(
      vehiclePositionsHere.map((p) => ({ amount: p.commitmentAmount!.toNumber(), currency: p.currency }))
    );

    vehicleExposures.push({
      id: vehicle.id,
      slug: vehicle.slug,
      nameEn: vehicle.nameEn,
      nameAr: vehicle.nameAr,
      type: vehicle.type,
      currency: vehicle.currency,
      investorOrgId: position.investorId,
      linkedCompanies,
      contributions,
      ownershipShare: totalContributed > 0 ? inVehicleCurrency(contributions) / totalContributed : null,
      navHistory: navSnapshots
        .filter((n) => n.vehicleId === vehicle.id)
        .map((n) => ({ asOfDate: toDateOnly(n.asOfDate), amount: n.navAmount.toNumber(), currency: n.currency })),
    });
  }

  return { orgs, periods, companies, vehicleExposures, news };
}
