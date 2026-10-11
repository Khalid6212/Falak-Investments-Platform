import "server-only";
import { db } from "@/lib/db";
import { requireFalakRoleWithDepartmentScope } from "@/lib/auth/department-scope";
import { industryKeyFor } from "@/lib/industries";
import type { Department } from "@/generated/prisma/client";

// Loads one active record for its edit form. Returns null when it doesn't
// exist, is archived, or belongs to a department the caller can't manage
// -- the edit page shows "not found" for all three alike.

function inScope(departments: Department[] | null, department: Department): boolean {
  return departments === null || departments.includes(department);
}

export async function getCompanyForEdit(id: string) {
  const { departments } = await requireFalakRoleWithDepartmentScope("FALAK_OPERATIONS");
  const c = await db.company.findUnique({ where: { id } });
  if (!c || c.archivedAt || !inScope(departments, c.department)) return null;
  return {
    id: c.id,
    slug: c.slug,
    nameEn: c.nameEn,
    nameAr: c.nameAr,
    industry: industryKeyFor(c.sectorEn),
    sectorEn: c.sectorEn,
    sectorAr: c.sectorAr,
    customerModel: c.customerModel,
    founderName: c.founderName ?? "",
    founderEmail: c.founderEmail ?? "",
    founderPhone: c.founderPhone ?? "",
    hqCity: c.hqCity ?? "",
    hqCountry: c.hqCountry ?? "",
    revenueModels: c.revenueModels as string[],
    currency: c.currency,
    entryStage: c.entryStage,
    currentStage: c.currentStage,
    department: c.department,
  };
}

export async function getVehicleForEdit(id: string) {
  const { departments } = await requireFalakRoleWithDepartmentScope("FALAK_OPERATIONS");
  const v = await db.vehicle.findUnique({ where: { id } });
  if (!v || v.archivedAt || !inScope(departments, v.department)) return null;
  return {
    id: v.id,
    slug: v.slug,
    nameEn: v.nameEn,
    nameAr: v.nameAr,
    type: v.type,
    currency: v.currency,
    vintageYear: v.vintageYear === null ? "" : String(v.vintageYear),
    department: v.department,
    descriptionEn: v.descriptionEn ?? "",
    descriptionAr: v.descriptionAr ?? "",
  };
}

export async function getInvestorForEdit(id: string) {
  const { departments } = await requireFalakRoleWithDepartmentScope("FALAK_OPERATIONS");
  const i = await db.investor.findUnique({ where: { id } });
  if (!i || i.archivedAt || !inScope(departments, i.department)) return null;
  return {
    id: i.id,
    nameEn: i.nameEn,
    nameAr: i.nameAr,
    type: i.type,
    department: i.department,
    contactEmail: i.contactEmail ?? "",
    contactPhone: i.contactPhone ?? "",
    briefEn: i.briefEn ?? "",
    briefAr: i.briefAr ?? "",
  };
}
