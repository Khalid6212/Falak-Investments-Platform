"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Select } from "@/components/ui/Select";
import { VehicleCompanyTable } from "./VehicleCompanyTable";
import { VehicleKpis } from "./VehicleKpis";
import { VehicleCapTable } from "./VehicleCapTable";
import { VehicleDifference } from "./VehicleDifference";
import { PortfolioAlertsPanel } from "@/components/portfolio/AlertsPanel";
import { CompanyTrendsTable } from "@/components/portfolio/CompanyTrendsTable";
import { ReportsLogTable } from "@/components/portfolio/ReportsLogTable";
import { extendReportingCycleDeadlineAction, resendReportToInvestorsAction } from "@/app/review/actions";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { computeVehicleCapTable, type VehicleCapitalOverview } from "@/lib/vehicle/cap-table-compute";
import type { DisplayCurrency } from "@/lib/currency/convert";
import type { VehicleDashboardData } from "@/lib/vehicle/dto";
import type { VehicleNavSummary } from "@/lib/vehicle/nav";
import type { PortfolioAlert } from "@/lib/admin/alerts";
import type { CompanyTrendDTO } from "@/lib/admin/company-trends";
import type { ReportingRequestRow } from "@/lib/admin/reporting-requests";

const DISPLAY_CURRENCIES: DisplayCurrency[] = ["USD", "SAR"];

interface VehicleDashboardViewProps extends VehicleDashboardData {
  nav: VehicleNavSummary;
  capitalOverview: VehicleCapitalOverview;
  alerts: PortfolioAlert[];
  companyTrends: CompanyTrendDTO[];
  reportingRequests: ReportingRequestRow[];
}

export function VehicleDashboardView({
  vehicle,
  periods,
  companies,
  nav,
  capitalOverview,
  alerts,
  companyTrends,
  reportingRequests,
}: VehicleDashboardViewProps) {
  const { t, lang } = useLanguage();
  const [selectedPeriodKey, setSelectedPeriodKey] = useState(periods[periods.length - 1]?.key ?? "");
  const [displayCurrency, setDisplayCurrency] = useState<DisplayCurrency>(vehicle.currency);
  const BackIcon = lang === "ar" ? ArrowRight : ArrowLeft;

  const capTable = useMemo(() => computeVehicleCapTable(capitalOverview, displayCurrency), [capitalOverview, displayCurrency]);
  // The viewer's language, falling back to the other when only one was written.
  const description = (lang === "ar" ? vehicle.descriptionAr || vehicle.descriptionEn : vehicle.descriptionEn || vehicle.descriptionAr) ?? "";

  return (
    <AppShell title={lang === "ar" ? vehicle.nameAr : vehicle.nameEn} subtitle={t.vehicleTypes[vehicle.type]}>
      <div className="space-y-6">
        <Link
          href="/vehicle"
          className="chamfer-br-sm inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-link-foreground shadow-[inset_0_0_0_1px_var(--control-border)] hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-link-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
        >
          <BackIcon aria-hidden="true" className="h-4 w-4" />
          {t.vehicleReport.backToDirectory}
        </Link>

        {description ? (
          <p className="chamfer-br-md max-w-3xl whitespace-pre-line bg-surface p-4 text-sm text-foreground shadow-[var(--inner-line)]">
            {description}
          </p>
        ) : null}

        <div className="flex flex-col gap-3 sm:flex-row">
          {periods.length > 0 ? (
            <div className="flex flex-col gap-1">
              <label htmlFor="vehicle-report-period" className="text-xs font-medium text-muted-foreground">
                {t.admin.filters.periodLabel}
              </label>
              <Select
                id="vehicle-report-period"
                className="sm:w-48"
                value={selectedPeriodKey}
                onChange={(e) => setSelectedPeriodKey(e.target.value)}
              >
                {periods.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}
          <div className="flex flex-col gap-1">
            <label htmlFor="vehicle-display-currency" className="text-xs font-medium text-muted-foreground">
              {t.admin.charts.currencyToggleLabel}
            </label>
            <Select
              id="vehicle-display-currency"
              className="sm:w-48"
              value={displayCurrency}
              onChange={(e) => setDisplayCurrency(e.target.value as DisplayCurrency)}
            >
              {DISPLAY_CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {t.currencyNames[c]}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <VehicleKpis
          companiesCount={companies.length}
          investedCapital={capTable.investedCapital}
          latestValuation={nav.latest}
          displayCurrency={displayCurrency}
        />

        <div className="space-y-3">
          <h2 className="font-heading text-sm font-semibold text-foreground">{t.vehicleReport.capTableTitle}</h2>
          <VehicleCapTable capTable={capTable} displayCurrency={displayCurrency} />
          <VehicleDifference capTable={capTable} displayCurrency={displayCurrency} vehicleSlug={vehicle.slug} />
        </div>

        <PortfolioAlertsPanel alerts={alerts} linkQuery={`fromVehicle=${vehicle.slug}`} />

        <div className="space-y-3">
          <h2 className="font-heading text-sm font-semibold text-foreground">{t.vehicleReport.trendsTitle}</h2>
          <CompanyTrendsTable
            trends={companyTrends}
            periodKey={selectedPeriodKey}
            displayCurrency={displayCurrency}
            linkQuery={`fromVehicle=${vehicle.slug}`}
          />
        </div>

        <div className="space-y-3">
          <h2 className="font-heading text-sm font-semibold text-foreground">{t.reviewWorkspace.reportsLogTitle}</h2>
          <ReportsLogTable
            rows={reportingRequests}
            extendDeadlineAction={extendReportingCycleDeadlineAction}
            resendAction={resendReportToInvestorsAction}
          />
        </div>

        <div>
          <h2 className="font-heading mb-3 text-sm font-semibold text-foreground">{t.vehicleReport.companiesTableTitle}</h2>
          <VehicleCompanyTable
            companies={companies}
            periodKey={selectedPeriodKey}
            vehicleSlug={vehicle.slug}
            caption={t.vehicleReport.companiesTableTitle}
            emptyStateText={t.vehicleReport.noCompaniesLinked}
          />
        </div>
      </div>
    </AppShell>
  );
}
