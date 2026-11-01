import "server-only";
import { db } from "@/lib/db";
import { requireCurrentUser } from "@/lib/auth/authorization";
import type { MyCompanyDTO } from "./dto";

function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Every company the signed-in user is a current member of (non-revoked
 * membership, non-archived company) with its current reporting period.
 * Scoped entirely to the caller's own user id -- never a client-supplied
 * company id. Zero memberships (e.g. a Falak staff account) is a valid
 * empty result, not a ForbiddenError.
 */
export async function getMyCompaniesData(): Promise<MyCompanyDTO[]> {
  const user = await requireCurrentUser();

  const memberships = await db.companyMembership.findMany({
    where: { userId: user.id, revokedAt: null, company: { archivedAt: null } },
    orderBy: { company: { nameEn: "asc" } },
    select: {
      role: true,
      company: {
        select: {
          id: true,
          slug: true,
          nameEn: true,
          nameAr: true,
          cycles: {
            where: { archivedAt: null },
            orderBy: { periodStart: "desc" },
            take: 1,
            select: { periodLabel: true, currentDeadline: true, submission: { select: { status: true } } },
          },
        },
      },
    },
  });

  return memberships.map(({ role, company }) => {
    const cycle = company.cycles[0];
    return {
      id: company.id,
      slug: company.slug,
      nameEn: company.nameEn,
      nameAr: company.nameAr,
      role,
      currentPeriod: cycle
        ? {
            label: cycle.periodLabel,
            status: cycle.submission?.status ?? "draft",
            currentDeadline: toDateOnly(cycle.currentDeadline),
          }
        : null,
    };
  });
}
