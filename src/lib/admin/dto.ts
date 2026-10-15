import type {
  Currency,
  CustomerModel,
  RevenueModel,
  FundingStage,
  VehicleType,
  InvestorType,
  SubmissionStatus,
  CompanyValuationType,
} from "@/generated/prisma/client";

// One entry per distinct ReportingCycle.periodLabel that exists anywhere in
// the database -- an open, DB-derived replacement for the mock UI's
// hardcoded two-item ReportingPeriod union. periodLabel is treated as the
// stable key: creating a cycle with the same label for a different company
// is how two companies end up "in the same period" (see
// createReportingCycleAction).
export interface AdminPeriodOption {
  key: string;
  label: string;
  periodStart: string;
  periodEnd: string;
}

// Mirrors the mock CyclePeriodData shape closely enough for the existing
// presentational components to keep working unchanged, but sourced from a
// real ReportingCycle/CompanySubmission/SubmissionMetricValue chain instead
// of a fixture. A company with no cycle for a given period key gets a
// synthesized entry here (status "draft", every other field null) so
// `company.periods[periodKey]` is always defined, exactly like the mock
// data's guarantee.
export interface AdminCompanyPeriodData {
  status: SubmissionStatus;
  revenue: number | null;
  lastUpdated: string | null;
  cycleId: string | null;
  submissionId: string | null;
  currentDeadline: string | null;
}

export interface AdminCompanyDTO {
  id: string;
  // When the record was last created or edited (ISO), for "recently added or edited" sorting.
  updatedAt: string;
  slug: string;
  nameEn: string;
  nameAr: string;
  sectorEn: string;
  sectorAr: string;
  customerModel: CustomerModel;
  revenueModels: RevenueModel[];
  currency: Currency;
  entryStage: FundingStage;
  currentStage: FundingStage;
  archivedAt: string | null;
  periods: Record<string, AdminCompanyPeriodData>;
}

export interface AdminVehicleDTO {
  id: string;
  updatedAt: string;
  slug: string;
  nameEn: string;
  nameAr: string;
  type: VehicleType;
  currency: Currency;
  archivedAt: string | null;
}

export interface AdminInvestorDTO {
  id: string;
  updatedAt: string;
  nameEn: string;
  nameAr: string;
  type: InvestorType;
  archivedAt: string | null;
}

export interface AdminOwnershipLinkDTO {
  vehicleId: string;
  companyId: string;
}

export interface AdminReportingTemplateDTO {
  id: string;
  updatedAt: string;
  nameEn: string;
  nameAr: string;
  isActive: boolean;
  /** Pre-ticks "ask for financial statements" on new requests. */
  collectFinancialStatements: boolean;
}

export interface AdminPortfolioData {
  companies: AdminCompanyDTO[];
  vehicles: AdminVehicleDTO[];
  investors: AdminInvestorDTO[];
  ownershipLinks: AdminOwnershipLinkDTO[];
  periods: AdminPeriodOption[];
  templates: AdminReportingTemplateDTO[];
}

// ============================================================
// Valuations -- latest CompanyValuationSnapshot / VehicleNavSnapshot per
// company/vehicle. `latest: null` for one with no mark recorded yet --
// never coerced to 0, same discipline as periodData.revenue elsewhere in
// this module.
// ============================================================

export interface LatestCompanyValuationDTO {
  asOfDate: string;
  amount: number;
  currency: Currency;
  valuationType: CompanyValuationType;
}

export interface AdminCompanyValuationDTO {
  id: string;
  nameEn: string;
  nameAr: string;
  latest: LatestCompanyValuationDTO | null;
}

export interface LatestVehicleNavDTO {
  asOfDate: string;
  amount: number;
  currency: Currency;
}

export interface AdminVehicleValuationDTO {
  id: string;
  nameEn: string;
  nameAr: string;
  latest: LatestVehicleNavDTO | null;
}

export interface PortfolioValuationData {
  companies: AdminCompanyValuationDTO[];
  vehicles: AdminVehicleValuationDTO[];
}
