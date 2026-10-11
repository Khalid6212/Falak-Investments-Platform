import type {
  Currency,
  CustomerModel,
  RevenueModel,
  FundingStage,
  VehicleType,
  SubmissionStatus,
  NarrativeKind,
  CompanyValuationType,
  Department,
} from "@/generated/prisma/client";
import type { SubmissionMetricFieldDTO } from "@/lib/reporting/dto";
import type { CompanyMetricBenchmark } from "@/lib/admin/benchmarking";

export interface CompanyReportNarrativeDTO {
  kind: NarrativeKind;
  textEn: string;
  textAr: string;
}

// cycleId/currentDeadline are non-nullable here, unlike AdminCompanyPeriodData
// -- every entry in a company-scoped periods record originates from a real
// ReportingCycle row for THIS company; there is no cross-company
// synthesized-draft case to leave room for. narratives is [] both when the
// period was never published and when it was published with zero sections
// written -- deliberately not distinguished, see CompanyReportView.
export interface CompanyReportPeriodData {
  status: SubmissionStatus;
  revenue: number | null;
  lastUpdated: string | null;
  cycleId: string;
  submissionId: string | null;
  currentDeadline: string;
  narratives: CompanyReportNarrativeDTO[];
  /** The reporting template the period was requested with. */
  templateNameEn: string;
  templateNameAr: string;
  /** A published (current) report version exists for this period. */
  isPublished: boolean;
  // Every submitted metric for this period, Falak-staff AND
  // company-member visible alike (unlike valuation below) -- these are
  // the company's own reported operating numbers, not a fund-controlled
  // mark.
  metrics: SubmissionMetricFieldDTO[];
  // Falak-staff-only (always [] for a company member, same visibility
  // rule as valuation below) -- this company's own percentile rank
  // against its portfolio peers for the same period, from the exact
  // same getPortfolioBenchmarks computation BenchmarksView uses. A
  // company's own members never see how they compare to other portfolio
  // companies' internals.
  benchmarks: CompanyMetricBenchmark[];
}

export interface CompanyReportPeriodOption {
  key: string;
  label: string;
  periodStart: string;
  periodEnd: string;
}

export interface CompanyReportVehicleDTO {
  id: string;
  slug: string;
  nameEn: string;
  nameAr: string;
  type: VehicleType;
  currency: Currency;
}

// FALAK_STAFF can view any company's report; COMPANY_MEMBER can view only
// their own. Nothing else is authorized -- see requireCompanyReportViewer
// in queries.ts. Threaded through to the client so it can adjust the
// back-link destination and whether the "Open Reporting Form" link shows.
export type CompanyReportViewerRole = "FALAK_STAFF" | "COMPANY_MEMBER";

export interface CompanyReportDTO {
  id: string;
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
  founderName: string | null;
  founderEmail: string | null;
  founderPhone: string | null;
  hqCity: string | null;
  hqCountry: string | null;
  department: Department;
  archivedAt: string | null;
  periods: Record<string, CompanyReportPeriodData>;
}

// Falak-staff-only visibility -- rendered by CompanyReportView only when
// viewerRole === "FALAK_STAFF" (confirmed with the project owner: a
// portfolio company's own members and investors don't see valuation
// marks, which are a Falak-controlled fund decision, not something a
// startup self-reports). Fetched regardless of viewer role (same cheap
// query either way, same pattern narratives already follows) -- the
// restriction is purely a rendering decision in the component.
export interface CompanyValuationPointDTO {
  asOfDate: string;
  amount: number;
  valuationType: CompanyValuationType;
}

/** One investment agreement through a vehicle. Falak-staff-only, like valuations. */
export interface CompanyInvestmentDTO {
  vehicleId: string;
  vehicleSlug: string;
  vehicleNameEn: string;
  vehicleNameAr: string;
  signedDate: string;
  investedAmount: number | null;
  currency: Currency | null;
  ownershipPct: number | null;
}

export interface CompanyReportData {
  company: CompanyReportDTO;
  periods: CompanyReportPeriodOption[];
  linkedVehicles: CompanyReportVehicleDTO[];
  viewerRole: CompanyReportViewerRole;
  valuations: CompanyValuationPointDTO[];
  /** Always [] for a company member. */
  investments: CompanyInvestmentDTO[];
}
