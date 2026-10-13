"use client";

import { Card } from "@/components/ui/Card";
import { countryName } from "@/lib/countries";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import type { CompanyReportDTO } from "@/lib/company/dto";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-end text-foreground">{children}</dd>
    </div>
  );
}

/** A startup's basic information: industry, models, stages, location and founder. */
export function CompanyInfoCard({ company, showDepartment = false }: { company: CompanyReportDTO; showDepartment?: boolean }) {
  const { t, lang } = useLanguage();

  return (
    <Card className="min-w-0">
      <h2 className="font-heading text-sm font-semibold text-foreground">{t.companyReport.profileTitle}</h2>
      <dl className="mt-3 space-y-2 text-sm">
        <Row label={t.admin.table.sectorColumn}>{lang === "ar" ? company.sectorAr : company.sectorEn}</Row>
        <Row label={t.admin.table.customerModelColumn}>{t.customerModels[company.customerModel]}</Row>
        {company.hqCity || company.hqCountry ? (
          <Row label={t.admin.manage.headquartersLabel}>
            {[company.hqCity, company.hqCountry ? countryName(company.hqCountry, lang) : null].filter(Boolean).join(", ")}
          </Row>
        ) : null}
        {company.website ? (
          <Row label={t.admin.manage.websiteShortLabel}>
            <a href={company.website} target="_blank" rel="noopener noreferrer" dir="ltr" className="text-link-foreground underline-offset-2 hover:underline">
              {company.website.replace(/^https?:\/\//, "")}
            </a>
          </Row>
        ) : null}
        {company.founderName || company.founderEmail || company.founderPhone ? (
          <Row label={t.admin.manage.founderLabel}>
            {company.founderName ? <span className="block">{company.founderName}</span> : null}
            {company.founderEmail ? (
              <a href={`mailto:${company.founderEmail}`} className="block text-link-foreground underline-offset-2 hover:underline">
                {company.founderEmail}
              </a>
            ) : null}
            {company.founderPhone ? (
              <a
                href={`tel:${company.founderPhone.replace(/[^+0-9]/g, "")}`}
                dir="ltr"
                className="block text-link-foreground underline-offset-2 hover:underline"
              >
                {company.founderPhone}
              </a>
            ) : null}
          </Row>
        ) : null}
        <Row label={t.admin.filters.currencyLabel}>{t.currencyNames[company.currency]}</Row>
        <Row label={t.admin.table.entryStageColumn}>{t.stages[company.entryStage]}</Row>
        <Row label={t.admin.table.currentStageColumn}>{t.stages[company.currentStage]}</Row>
        {showDepartment ? <Row label={t.admin.manage.departmentLabel}>{t.departments[company.department]}</Row> : null}
        <div className="flex flex-wrap justify-between gap-3">
          <dt className="shrink-0 text-muted-foreground">{t.companyReport.revenueModelsLabel}</dt>
          <dd className="flex min-w-0 flex-wrap justify-end gap-1.5">
            {company.revenueModels.length === 0 ? (
              <span className="text-muted-foreground">—</span>
            ) : (
              company.revenueModels.map((m) => (
                <span key={m} className="break-words rounded-full bg-surface-muted px-2 py-0.5 text-xs text-foreground">
                  {t.revenueModels[m]}
                </span>
              ))
            )}
          </dd>
        </div>
      </dl>
    </Card>
  );
}
