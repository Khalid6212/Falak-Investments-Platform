"use client";

import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { createInvestorAction, updateInvestorAction } from "../../actions";
import { labelClass, fieldClass, FormMessage, FieldError, fieldA11y, invalidClass, prefill, useEntityForm } from "./shared";

export interface InvestorFormValues {
  id: string;
  nameEn: string;
  nameAr: string;
  type: string;
  department: string;
  contactEmail: string;
  contactPhone: string;
  briefEn: string;
  briefAr: string;
}

/** Create an investor, or edit an existing one when `investor` is given. */
export function CreateInvestorForm({ investor }: { investor?: InvestorFormValues }) {
  const { t } = useLanguage();
  const { state, formAction, isPending, formRef, formKey } = useEntityForm(investor ? updateInvestorAction : createInvestorAction);
  const saved = investor as unknown as Record<string, string> | undefined;
  const value = (name: string) => prefill(state, saved, name);
  const field = (id: string, name: string) => ({ id, name, ...fieldA11y(state, id, name), className: invalidClass });

  return (
    <form key={formKey} ref={formRef} action={formAction} noValidate className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {investor ? <input type="hidden" name="investorId" value={investor.id} /> : null}
      <div className={fieldClass}>
        <label className={labelClass} htmlFor="i-nameEn">{t.admin.manage.nameEnLabel}</label>
        <Input {...field("i-nameEn", "nameEn")} defaultValue={value("nameEn")} required />
        <FieldError state={state} id="i-nameEn" name="nameEn" />
      </div>
      <div className={fieldClass}>
        <label className={labelClass} htmlFor="i-nameAr">{t.admin.manage.nameArLabel}</label>
        <Input {...field("i-nameAr", "nameAr")} defaultValue={value("nameAr")} dir="rtl" required />
        <FieldError state={state} id="i-nameAr" name="nameAr" />
      </div>
      <div className={fieldClass}>
        <label className={labelClass} htmlFor="i-type">{t.admin.manage.typeLabel}</label>
        <Select {...field("i-type", "type")} required defaultValue={value("type")}>
          <option value="" disabled>{t.admin.manage.selectPlaceholder}</option>
          <option value="Institutional">{t.investorTypes.Institutional}</option>
          <option value="FamilyOffice">{t.investorTypes.FamilyOffice}</option>
          <option value="Individual">{t.investorTypes.Individual}</option>
        </Select>
        <FieldError state={state} id="i-type" name="type" />
      </div>
      <div className={fieldClass}>
        <label className={labelClass} htmlFor="i-department">{t.admin.manage.departmentLabel}</label>
        <Select {...field("i-department", "department")} required defaultValue={value("department")}>
          <option value="" disabled>{t.admin.manage.selectPlaceholder}</option>
          <option value="VentureBuilder">{t.departments.VentureBuilder}</option>
          <option value="InvestmentDepartment">{t.departments.InvestmentDepartment}</option>
        </Select>
        <FieldError state={state} id="i-department" name="department" />
      </div>
      <div className={fieldClass}>
        <label className={labelClass} htmlFor="i-contactEmail">{t.admin.manage.investorEmailLabel}</label>
        <Input {...field("i-contactEmail", "contactEmail")} type="email" defaultValue={value("contactEmail")} dir="ltr" />
        <FieldError state={state} id="i-contactEmail" name="contactEmail" />
      </div>
      <div className={fieldClass}>
        <label className={labelClass} htmlFor="i-contactPhone">{t.admin.manage.investorPhoneLabel}</label>
        <Input {...field("i-contactPhone", "contactPhone")} type="tel" defaultValue={value("contactPhone")} dir="ltr" placeholder="+966 5X XXX XXXX" />
        <FieldError state={state} id="i-contactPhone" name="contactPhone" />
      </div>
      <div className={fieldClass}>
        <label className={labelClass} htmlFor="i-briefEn">{t.admin.manage.investorBriefEnLabel}</label>
        <Textarea {...field("i-briefEn", "briefEn")} defaultValue={value("briefEn")} rows={3} maxLength={2000} />
        <FieldError state={state} id="i-briefEn" name="briefEn" />
      </div>
      <div className={fieldClass}>
        <label className={labelClass} htmlFor="i-briefAr">{t.admin.manage.investorBriefArLabel}</label>
        <Textarea {...field("i-briefAr", "briefAr")} defaultValue={value("briefAr")} rows={3} maxLength={2000} dir="rtl" />
        <FieldError state={state} id="i-briefAr" name="briefAr" />
      </div>
      <div className="sm:col-span-2">
        <FormMessage state={state} />
      </div>
      <Button type="submit" disabled={isPending} className="sm:col-span-2 sm:w-fit">
        {investor ? t.admin.manage.saveChangesLabel : t.admin.manage.submitLabel}
      </Button>
    </form>
  );
}
