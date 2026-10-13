"use client";

import { useState } from "react";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { createCompanyAction, updateCompanyAction, type ActionState } from "../../actions";
import {
  labelClass,
  fieldClass,
  FormMessage,
  FieldError,
  fieldA11y,
  invalidClass,
  prefill,
  prefillList,
  useEntityForm,
} from "./shared";
import { slugify } from "@/lib/slugify";
import { INDUSTRIES, OTHER_INDUSTRY } from "@/lib/industries";
import { COUNTRY_CODES, PRIORITY_COUNTRIES, countryName } from "@/lib/countries";

export interface CompanyFormValues {
  id: string;
  slug: string;
  nameEn: string;
  nameAr: string;
  industry: string;
  sectorEn: string;
  sectorAr: string;
  customerModel: string;
  founderName: string;
  founderEmail: string;
  founderPhone: string;
  hqCity: string;
  website: string;
  hqCountry: string;
  revenueModels: string[];
  currency: string;
  entryStage: string;
  currentStage: string;
  department: string;
}

const STAGES = ["PreSeed", "BridgeToSeed", "Seed", "PreSeriesA", "BridgeToSeriesA", "SeriesA", "SeriesB", "Later"] as const;
const CUSTOMER_MODELS = ["B2B", "B2C", "B2B_B2C", "B2B2C", "B2G", "C2C", "D2C"] as const;

/** Create a startup, or edit an existing one when `company` is given. */
export function CreateCompanyForm({ company }: { company?: CompanyFormValues }) {
  const { t } = useLanguage();
  const { state, formAction, isPending, formRef, formKey } = useEntityForm(company ? updateCompanyAction : createCompanyAction);
  return (
    <CompanyFields
      key={formKey}
      state={state}
      company={company}
      formAction={formAction}
      formRef={formRef}
      isPending={isPending}
      submitLabel={company ? t.admin.manage.saveChangesLabel : t.admin.manage.submitLabel}
    />
  );
}

function CompanyFields({
  state,
  company,
  formAction,
  formRef,
  isPending,
  submitLabel,
}: {
  state: ActionState;
  company?: CompanyFormValues;
  formAction: (formData: FormData) => void;
  formRef: React.RefObject<HTMLFormElement | null>;
  isPending: boolean;
  submitLabel: string;
}) {
  const { t, lang } = useLanguage();
  const saved = company as unknown as Record<string, string | string[]> | undefined;
  const value = (name: string) => prefill(state, saved, name);
  const [slug, setSlug] = useState(value("slug"));
  // Auto-fill the slug from the English name only for a new company, and
  // only until the slug is edited by hand.
  const [slugTouched, setSlugTouched] = useState(Boolean(company) || value("slug") !== "");
  const revenueModels = prefillList(state, saved, "revenueModels");
  const [industry, setIndustry] = useState(value("industry"));
  const otherCountries = COUNTRY_CODES.filter((c) => !PRIORITY_COUNTRIES.includes(c))
    .map((code) => ({ code, name: countryName(code, lang) }))
    .sort((a, b) => a.name.localeCompare(b.name, lang));

  const field = (id: string, name: string) => ({ id, name, ...fieldA11y(state, id, name), className: invalidClass });

  return (
    <form ref={formRef} action={formAction} noValidate className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {company ? <input type="hidden" name="companyId" value={company.id} /> : null}
      <div className={fieldClass}>
        <label className={labelClass} htmlFor="c-nameEn">{t.admin.manage.nameEnLabel}</label>
        <Input
          {...field("c-nameEn", "nameEn")}
          defaultValue={value("nameEn")}
          required
          onBlur={(e) => {
            if (!slugTouched) setSlug(slugify(e.target.value));
          }}
        />
        <FieldError state={state} id="c-nameEn" name="nameEn" />
      </div>
      <div className={fieldClass}>
        <label className={labelClass} htmlFor="c-nameAr">{t.admin.manage.nameArLabel}</label>
        <Input {...field("c-nameAr", "nameAr")} defaultValue={value("nameAr")} dir="rtl" required />
        <FieldError state={state} id="c-nameAr" name="nameAr" />
      </div>
      <div className={fieldClass}>
        <label className={labelClass} htmlFor="c-slug">{t.admin.manage.slugLabel}</label>
        <Input
          {...field("c-slug", "slug")}
          required
          value={slug}
          onChange={(e) => {
            setSlugTouched(true);
            setSlug(slugify(e.target.value));
          }}
        />
        <FieldError state={state} id="c-slug" name="slug" />
      </div>
      <div className={fieldClass}>
        <label className={labelClass} htmlFor="c-industry">{t.admin.manage.industryLabel}</label>
        <Select
          {...field("c-industry", "industry")}
          required
          value={industry}
          onChange={(e) => setIndustry(e.target.value)}
        >
          <option value="" disabled>{t.admin.manage.selectPlaceholder}</option>
          {INDUSTRIES.map((i) => (
            <option key={i.key} value={i.key}>{lang === "ar" ? i.ar : i.en}</option>
          ))}
        </Select>
        <FieldError state={state} id="c-industry" name="industry" />
      </div>
      {industry === OTHER_INDUSTRY ? (
        <>
          <div className={fieldClass}>
            <label className={labelClass} htmlFor="c-sectorEn">{t.admin.manage.industryOtherEnLabel}</label>
            <Input {...field("c-sectorEn", "sectorEn")} defaultValue={value("sectorEn")} required />
            <FieldError state={state} id="c-sectorEn" name="sectorEn" />
          </div>
          <div className={fieldClass}>
            <label className={labelClass} htmlFor="c-sectorAr">{t.admin.manage.industryOtherArLabel}</label>
            <Input {...field("c-sectorAr", "sectorAr")} defaultValue={value("sectorAr")} dir="rtl" required />
            <FieldError state={state} id="c-sectorAr" name="sectorAr" />
          </div>
        </>
      ) : null}
      <div className={fieldClass}>
        <label className={labelClass} htmlFor="c-customerModel">{t.admin.manage.customerModelLabel}</label>
        <Select {...field("c-customerModel", "customerModel")} required defaultValue={value("customerModel")}>
          <option value="" disabled>{t.admin.manage.selectPlaceholder}</option>
          {CUSTOMER_MODELS.map((m) => (
            <option key={m} value={m}>{t.customerModels[m]}</option>
          ))}
        </Select>
        <FieldError state={state} id="c-customerModel" name="customerModel" />
      </div>
      <div className={fieldClass}>
        <label className={labelClass} htmlFor="c-currency">{t.admin.manage.currencyLabel}</label>
        <Select {...field("c-currency", "currency")} required defaultValue={value("currency")}>
          <option value="" disabled>{t.admin.manage.selectPlaceholder}</option>
          <option value="SAR">{t.currencyNames.SAR}</option>
          <option value="USD">{t.currencyNames.USD}</option>
        </Select>
        <FieldError state={state} id="c-currency" name="currency" />
      </div>
      <div className={fieldClass}>
        <label className={labelClass} htmlFor="c-entryStage">{t.admin.manage.entryStageLabel}</label>
        <Select {...field("c-entryStage", "entryStage")} required defaultValue={value("entryStage")}>
          <option value="" disabled>{t.admin.manage.selectPlaceholder}</option>
          {STAGES.map((s) => (
            <option key={s} value={s}>{t.stages[s]}</option>
          ))}
        </Select>
        <FieldError state={state} id="c-entryStage" name="entryStage" />
      </div>
      <div className={fieldClass}>
        <label className={labelClass} htmlFor="c-currentStage">{t.admin.manage.currentStageLabel}</label>
        <Select {...field("c-currentStage", "currentStage")} required defaultValue={value("currentStage")}>
          <option value="" disabled>{t.admin.manage.selectPlaceholder}</option>
          {STAGES.map((s) => (
            <option key={s} value={s}>{t.stages[s]}</option>
          ))}
        </Select>
        <FieldError state={state} id="c-currentStage" name="currentStage" />
      </div>
      <div className={fieldClass}>
        <label className={labelClass} htmlFor="c-department">{t.admin.manage.departmentLabel}</label>
        <Select {...field("c-department", "department")} required defaultValue={value("department")}>
          <option value="" disabled>{t.admin.manage.selectPlaceholder}</option>
          <option value="VentureBuilder">{t.departments.VentureBuilder}</option>
          <option value="InvestmentDepartment">{t.departments.InvestmentDepartment}</option>
        </Select>
        <FieldError state={state} id="c-department" name="department" />
      </div>
      <h4 className="mt-2 text-xs font-semibold text-muted-foreground sm:col-span-2">{t.admin.manage.founderSectionTitle}</h4>
      <div className={fieldClass}>
        <label className={labelClass} htmlFor="c-founderName">{t.admin.manage.founderNameLabel}</label>
        <Input {...field("c-founderName", "founderName")} defaultValue={value("founderName")} autoComplete="off" />
        <FieldError state={state} id="c-founderName" name="founderName" />
      </div>
      <div className={fieldClass}>
        <label className={labelClass} htmlFor="c-founderEmail">{t.admin.manage.founderEmailLabel}</label>
        <Input {...field("c-founderEmail", "founderEmail")} defaultValue={value("founderEmail")} type="email" autoComplete="off" />
        <FieldError state={state} id="c-founderEmail" name="founderEmail" />
      </div>
      <div className={fieldClass}>
        <label className={labelClass} htmlFor="c-founderPhone">{t.admin.manage.founderPhoneLabel}</label>
        <Input {...field("c-founderPhone", "founderPhone")} defaultValue={value("founderPhone")} type="tel" dir="ltr" autoComplete="off" />
        <FieldError state={state} id="c-founderPhone" name="founderPhone" />
      </div>
      <div className={fieldClass}>
        <label className={labelClass} htmlFor="c-hqCity">{t.admin.manage.hqCityLabel}</label>
        <Input {...field("c-hqCity", "hqCity")} defaultValue={value("hqCity")} />
        <FieldError state={state} id="c-hqCity" name="hqCity" />
      </div>
      <div className={fieldClass}>
        <label className={labelClass} htmlFor="c-hqCountry">{t.admin.manage.hqCountryLabel}</label>
        <Select {...field("c-hqCountry", "hqCountry")} defaultValue={value("hqCountry")}>
          <option value="">{t.admin.manage.selectPlaceholder}</option>
          {PRIORITY_COUNTRIES.map((code) => (
            <option key={code} value={code}>{countryName(code, lang)}</option>
          ))}
          <option disabled>──────────</option>
          {otherCountries.map(({ code, name }) => (
            <option key={code} value={code}>{name}</option>
          ))}
        </Select>
        <FieldError state={state} id="c-hqCountry" name="hqCountry" />
      </div>
      <div className={fieldClass}>
        <label className={labelClass} htmlFor="c-website">{t.admin.manage.websiteLabel}</label>
        <Input {...field("c-website", "website")} defaultValue={value("website")} dir="ltr" inputMode="url" placeholder="www.company.com" autoComplete="off" />
        <FieldError state={state} id="c-website" name="website" />
      </div>
      <fieldset className="sm:col-span-2" aria-describedby={state.fieldErrors?.revenueModels ? "c-revenueModels-error" : undefined}>
        <legend className={labelClass}>{t.admin.manage.revenueModelsLabel}</legend>
        <div className="mt-1 flex flex-wrap gap-3">
          {(["SaaS", "Marketplace", "ECommerce", "TransactionBased", "Subscription", "Other"] as const).map((m) => (
            <label key={m} className="inline-flex items-center gap-1.5 text-sm text-foreground">
              <input type="checkbox" name="revenueModels" value={m} defaultChecked={revenueModels.includes(m)} />
              {t.revenueModels[m]}
            </label>
          ))}
        </div>
        <FieldError state={state} id="c-revenueModels" name="revenueModels" />
      </fieldset>
      <div className="sm:col-span-2">
        <FormMessage state={state} />
      </div>
      <Button type="submit" disabled={isPending} className="sm:col-span-2 sm:w-fit">
        {submitLabel}
      </Button>
    </form>
  );
}
