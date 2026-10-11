import type {
  Currency,
  CustomerModel,
  Department,
  FundingStage,
  InvestorType,
  RevenueModel,
  VehicleType,
} from "@/generated/prisma/client";
import { INDUSTRIES, OTHER_INDUSTRY } from "@/lib/industries";
import { COUNTRY_CODES } from "@/lib/countries";

// Pure validation for the company / vehicle / investor forms, shared by
// their create and edit actions. Returns one message per bad field so the
// form can highlight exactly those fields, plus the submitted values so
// nothing the user typed is lost.

export type FieldErrors = Record<string, string>;
export type FormValues = Record<string, string | string[]>;

export const FIX_HIGHLIGHTED = "Fix the highlighted fields and try again.";
export const OUT_OF_DEPARTMENT_FIELD = "You can only use your own department.";

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const MAX_NAME_LENGTH = 200;
const MAX_SLUG_LENGTH = 80;
const MAX_DESCRIPTION_LENGTH = 2000;
const MIN_VINTAGE_YEAR = 1990;
const MAX_VINTAGE_YEAR = 2100;

const CURRENCIES: Currency[] = ["SAR", "USD"];
const CUSTOMER_MODELS: CustomerModel[] = ["B2B", "B2C", "B2B_B2C", "B2B2C", "B2G", "C2C", "D2C"];
const REVENUE_MODELS: RevenueModel[] = ["SaaS", "Marketplace", "ECommerce", "TransactionBased", "Subscription", "Other"];
const FUNDING_STAGES: FundingStage[] = [
  "PreSeed",
  "BridgeToSeed",
  "Seed",
  "PreSeriesA",
  "BridgeToSeriesA",
  "SeriesA",
  "SeriesB",
  "Later",
];
// Loose on purpose: catches typos without rejecting unusual-but-real addresses/numbers.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^\+?[0-9][0-9 ()-]{5,24}$/;
const VEHICLE_TYPES: VehicleType[] = ["Fund", "SPV"];
const INVESTOR_TYPES: InvestorType[] = ["Institutional", "FamilyOffice", "Individual"];
const DEPARTMENTS: Department[] = ["VentureBuilder", "InvestmentDepartment"];

const MSG = {
  slug: "Use lowercase letters, numbers and single hyphens, e.g. startup-x.",
  name: `Required, up to ${MAX_NAME_LENGTH} characters.`,
  choose: "Choose an option.",
  revenueModels: "Choose only from the listed options.",
  email: "Enter a valid email address, e.g. name@company.com.",
  phone: "Enter a valid phone number, e.g. +966 5X XXX XXXX.",
  optionalText: `Up to ${MAX_NAME_LENGTH} characters.`,
  description: `Up to ${MAX_DESCRIPTION_LENGTH} characters.`,
  vintageYear: `Enter a year between ${MIN_VINTAGE_YEAR} and ${MAX_VINTAGE_YEAR}, or leave it empty.`,
};

function read(formData: FormData, field: string): string {
  const value = formData.get(field);
  return typeof value === "string" ? value.trim() : "";
}

function isName(value: string): boolean {
  return value.length > 0 && value.length <= MAX_NAME_LENGTH;
}

function isSlug(value: string): boolean {
  return value.length > 0 && value.length <= MAX_SLUG_LENGTH && SLUG_PATTERN.test(value);
}

function oneOf<T extends string>(value: string, options: readonly T[]): value is T {
  return (options as readonly string[]).includes(value);
}

/** Department checks are scope-aware: null departments = Admin (any department). */
function checkDepartment(value: string, scope: Department[] | null, errors: FieldErrors): Department | null {
  if (!oneOf(value, DEPARTMENTS)) {
    errors.department = MSG.choose;
    return null;
  }
  if (scope !== null && !scope.includes(value)) {
    errors.department = OUT_OF_DEPARTMENT_FIELD;
    return null;
  }
  return value;
}

export interface Validated<T> {
  values: FormValues;
  errors: FieldErrors;
  input: T | null;
}

export interface CompanyInput {
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
  department: Department;
  founderName: string | null;
  founderEmail: string | null;
  founderPhone: string | null;
  hqCity: string | null;
  hqCountry: string | null;
}

export function validateCompany(formData: FormData, scope: Department[] | null): Validated<CompanyInput> {
  const v = {
    slug: read(formData, "slug"),
    nameEn: read(formData, "nameEn"),
    nameAr: read(formData, "nameAr"),
    industry: read(formData, "industry"),
    sectorEn: read(formData, "sectorEn"),
    sectorAr: read(formData, "sectorAr"),
    customerModel: read(formData, "customerModel"),
    founderName: read(formData, "founderName"),
    founderEmail: read(formData, "founderEmail"),
    founderPhone: read(formData, "founderPhone"),
    hqCity: read(formData, "hqCity"),
    hqCountry: read(formData, "hqCountry"),
    currency: read(formData, "currency"),
    entryStage: read(formData, "entryStage"),
    currentStage: read(formData, "currentStage"),
    department: read(formData, "department"),
  };
  const revenueModels = formData.getAll("revenueModels").filter((x): x is string => typeof x === "string");
  const errors: FieldErrors = {};

  if (!isSlug(v.slug)) errors.slug = MSG.slug;
  for (const f of ["nameEn", "nameAr"] as const) {
    if (!isName(v[f])) errors[f] = MSG.name;
  }
  // A listed industry supplies both labels; "Other" uses the typed ones.
  const industry = INDUSTRIES.find((i) => i.key === v.industry);
  let sectorEn = v.sectorEn;
  let sectorAr = v.sectorAr;
  if (!industry) {
    errors.industry = MSG.choose;
  } else if (industry.key === OTHER_INDUSTRY) {
    if (!isName(sectorEn)) errors.sectorEn = MSG.name;
    if (!isName(sectorAr)) errors.sectorAr = MSG.name;
  } else {
    sectorEn = industry.en;
    sectorAr = industry.ar;
  }
  for (const f of ["founderName", "hqCity"] as const) {
    if (v[f].length > MAX_NAME_LENGTH) errors[f] = MSG.optionalText;
  }
  if (v.founderEmail && (v.founderEmail.length > MAX_NAME_LENGTH || !EMAIL_PATTERN.test(v.founderEmail))) {
    errors.founderEmail = MSG.email;
  }
  if (v.founderPhone && !PHONE_PATTERN.test(v.founderPhone)) errors.founderPhone = MSG.phone;
  if (v.hqCountry && !oneOf(v.hqCountry, COUNTRY_CODES)) errors.hqCountry = MSG.choose;
  if (!oneOf(v.customerModel, CUSTOMER_MODELS)) errors.customerModel = MSG.choose;
  if (!oneOf(v.currency, CURRENCIES)) errors.currency = MSG.choose;
  if (!oneOf(v.entryStage, FUNDING_STAGES)) errors.entryStage = MSG.choose;
  if (!oneOf(v.currentStage, FUNDING_STAGES)) errors.currentStage = MSG.choose;
  if (revenueModels.some((m) => !oneOf(m, REVENUE_MODELS))) errors.revenueModels = MSG.revenueModels;
  const department = checkDepartment(v.department, scope, errors);

  const values: FormValues = { ...v, revenueModels };
  if (Object.keys(errors).length > 0 || !department) return { values, errors, input: null };
  return {
    values,
    errors,
    input: {
      slug: v.slug,
      nameEn: v.nameEn,
      nameAr: v.nameAr,
      sectorEn,
      sectorAr,
      founderName: v.founderName || null,
      founderEmail: v.founderEmail ? v.founderEmail.toLowerCase() : null,
      founderPhone: v.founderPhone || null,
      hqCity: v.hqCity || null,
      hqCountry: v.hqCountry || null,
      customerModel: v.customerModel as CustomerModel,
      currency: v.currency as Currency,
      entryStage: v.entryStage as FundingStage,
      currentStage: v.currentStage as FundingStage,
      revenueModels: revenueModels as RevenueModel[],
      department,
    },
  };
}

export interface VehicleInput {
  slug: string;
  nameEn: string;
  nameAr: string;
  type: VehicleType;
  currency: Currency;
  vintageYear: number | null;
  department: Department;
  descriptionEn: string | null;
  descriptionAr: string | null;
}

export function validateVehicle(formData: FormData, scope: Department[] | null): Validated<VehicleInput> {
  const v = {
    slug: read(formData, "slug"),
    nameEn: read(formData, "nameEn"),
    nameAr: read(formData, "nameAr"),
    type: read(formData, "type"),
    currency: read(formData, "currency"),
    vintageYear: read(formData, "vintageYear"),
    department: read(formData, "department"),
    descriptionEn: read(formData, "descriptionEn"),
    descriptionAr: read(formData, "descriptionAr"),
  };
  const errors: FieldErrors = {};

  if (!isSlug(v.slug)) errors.slug = MSG.slug;
  if (v.descriptionEn.length > MAX_DESCRIPTION_LENGTH) errors.descriptionEn = MSG.description;
  if (v.descriptionAr.length > MAX_DESCRIPTION_LENGTH) errors.descriptionAr = MSG.description;
  if (!isName(v.nameEn)) errors.nameEn = MSG.name;
  if (!isName(v.nameAr)) errors.nameAr = MSG.name;
  if (!oneOf(v.type, VEHICLE_TYPES)) errors.type = MSG.choose;
  if (!oneOf(v.currency, CURRENCIES)) errors.currency = MSG.choose;
  const vintageYear = v.vintageYear === "" ? null : Number(v.vintageYear);
  if (vintageYear !== null && (!Number.isInteger(vintageYear) || vintageYear < MIN_VINTAGE_YEAR || vintageYear > MAX_VINTAGE_YEAR)) {
    errors.vintageYear = MSG.vintageYear;
  }
  const department = checkDepartment(v.department, scope, errors);

  if (Object.keys(errors).length > 0 || !department) return { values: v, errors, input: null };
  return {
    values: v,
    errors,
    input: {
      ...v,
      type: v.type as VehicleType,
      currency: v.currency as Currency,
      vintageYear,
      department,
      descriptionEn: v.descriptionEn || null,
      descriptionAr: v.descriptionAr || null,
    },
  };
}

export interface InvestorInput {
  nameEn: string;
  nameAr: string;
  type: InvestorType;
  department: Department;
  contactEmail: string | null;
  contactPhone: string | null;
  briefEn: string | null;
  briefAr: string | null;
}

export function validateInvestor(formData: FormData, scope: Department[] | null): Validated<InvestorInput> {
  const v = {
    nameEn: read(formData, "nameEn"),
    nameAr: read(formData, "nameAr"),
    type: read(formData, "type"),
    department: read(formData, "department"),
    contactEmail: read(formData, "contactEmail"),
    contactPhone: read(formData, "contactPhone"),
    briefEn: read(formData, "briefEn"),
    briefAr: read(formData, "briefAr"),
  };
  const errors: FieldErrors = {};

  if (!isName(v.nameEn)) errors.nameEn = MSG.name;
  if (!isName(v.nameAr)) errors.nameAr = MSG.name;
  if (!oneOf(v.type, INVESTOR_TYPES)) errors.type = MSG.choose;
  if (v.contactEmail && (v.contactEmail.length > MAX_NAME_LENGTH || !EMAIL_PATTERN.test(v.contactEmail))) {
    errors.contactEmail = MSG.email;
  }
  if (v.contactPhone && !PHONE_PATTERN.test(v.contactPhone)) errors.contactPhone = MSG.phone;
  if (v.briefEn.length > MAX_DESCRIPTION_LENGTH) errors.briefEn = MSG.description;
  if (v.briefAr.length > MAX_DESCRIPTION_LENGTH) errors.briefAr = MSG.description;
  const department = checkDepartment(v.department, scope, errors);

  if (Object.keys(errors).length > 0 || !department) return { values: v, errors, input: null };
  return {
    values: v,
    errors,
    input: {
      nameEn: v.nameEn,
      nameAr: v.nameAr,
      type: v.type as InvestorType,
      department,
      contactEmail: v.contactEmail ? v.contactEmail.toLowerCase() : null,
      contactPhone: v.contactPhone || null,
      briefEn: v.briefEn || null,
      briefAr: v.briefAr || null,
    },
  };
}
