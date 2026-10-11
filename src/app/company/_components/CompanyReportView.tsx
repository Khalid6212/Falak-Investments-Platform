"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/Card";
import { CompanyDashboard } from "./CompanyDashboard";
import { CompanyInfoCard } from "./CompanyInfoCard";
import { ReportingHistoryList } from "./ReportingHistoryList";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import type { CompanyReportData } from "@/lib/company/dto";

interface CompanyReportViewProps {
  data: CompanyReportData;
  initialPeriodKey: string;
  // Set when the report was opened from a vehicle dashboard's companies
  // table, so the back link returns there instead of the register.
  fromVehicleSlug: string | null;
  // Set when opened from the Falak admin dashboard or Company List, so
  // the back link returns there instead of the register -- the same
  // "remember where staff came from" idea as fromVehicleSlug, just for
  // the two other staff-side entry points. Never resource-scoped (no
  // slug to validate), so unlike fromVehicleSlug this needs no
  // linkedVehicles-style lookup -- the page.tsx caller already narrows
  // it to exactly "admin" | "companies" | null.
  from: "admin" | "companies" | null;
}

export function CompanyReportView({ data, initialPeriodKey, fromVehicleSlug, from }: CompanyReportViewProps) {
  const { company, periods, linkedVehicles, viewerRole } = data;
  const { t, lang } = useLanguage();
  const [selectedPeriodKey, setSelectedPeriodKey] = useState(initialPeriodKey);
  const BackIcon = lang === "ar" ? ArrowRight : ArrowLeft;

  // Company members go back to their own "My Companies" page (they can't
  // see the register, vehicles, or admin views). Falak staff go back to
  // the vehicle the report was opened from -- only honored for a vehicle
  // actually linked to this company, so a hand-edited ?fromVehicle= can't
  // point elsewhere -- then to the admin dashboard or Company List if
  // that's where they came from, or to the register as the final
  // fallback.
  const fromVehicle =
    viewerRole === "FALAK_STAFF" && fromVehicleSlug
      ? linkedVehicles.find((v) => v.slug === fromVehicleSlug)
      : undefined;
  const backHref =
    viewerRole === "COMPANY_MEMBER"
      ? "/submit"
      : fromVehicle
        ? `/vehicle/${fromVehicle.slug}`
        : from === "admin"
          ? "/admin"
          : from === "companies"
            ? "/admin/companies"
            : "/company";
  const backLabel =
    viewerRole === "COMPANY_MEMBER"
      ? t.companyReport.backToMyCompanies
      : fromVehicle
        ? `${t.companyReport.backToPrefix} ${lang === "ar" ? fromVehicle.nameAr : fromVehicle.nameEn}`
        : from === "admin"
          ? `${t.companyReport.backToPrefix} ${t.nav.portfolioDashboard}`
          : from === "companies"
            ? `${t.companyReport.backToPrefix} ${t.nav.companyList}`
            : t.companyReport.backToRegister;

  return (
    <AppShell title={lang === "ar" ? company.nameAr : company.nameEn} subtitle={lang === "ar" ? company.sectorAr : company.sectorEn}>
      <div className="space-y-6">
        <Link
          href={backHref}
          className="chamfer-br-sm inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-link-foreground shadow-[inset_0_0_0_1px_var(--control-border)] hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-link-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
        >
          <BackIcon aria-hidden="true" className="h-4 w-4" />
          {backLabel}
        </Link>

        <CompanyDashboard data={data} selectedPeriodKey={selectedPeriodKey} onPeriodChange={setSelectedPeriodKey} />

        {viewerRole === "FALAK_STAFF" ? (
          <Link href={`/company/${company.slug}/profile`} className="chamfer-br-sm inline-flex w-fit items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-link-foreground shadow-[inset_0_0_0_1px_var(--control-border)] hover:bg-surface-muted">
            {t.companyProfile.openProfileAction}
          </Link>
        ) : null}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <CompanyInfoCard company={company} />

          <Card className="min-w-0">
            <h2 className="font-heading text-sm font-semibold text-foreground">{t.companyReport.linkedVehiclesTitle}</h2>
            {linkedVehicles.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">{t.companyReport.noVehiclesLinked}</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {linkedVehicles.map((v) => (
                  <li key={v.id} className="flex items-center justify-between gap-3 text-sm">
                    <Link
                      href={`/vehicle/${v.slug}`}
                      className="chamfer-br-sm min-w-0 break-words text-start text-link-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-link-foreground"
                    >
                      {lang === "ar" ? v.nameAr : v.nameEn}
                    </Link>
                    <span className="shrink-0 text-xs text-muted-foreground">{t.vehicleTypes[v.type]}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {periods.length > 0 ? (
          <ReportingHistoryList periodOptions={periods} periodsData={company.periods} currency={company.currency} />
        ) : null}
      </div>
    </AppShell>
  );
}
