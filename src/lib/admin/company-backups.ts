import "server-only";
import { db } from "@/lib/db";
import { requireFalakRole } from "@/lib/auth/authorization";

// Before a startup's details are changed (by the edit form, an Excel import
// or a restore), its previous details are kept in that change's audit
// event (meta.before). Audit events are never deleted, so the copy is
// always there; the platform offers restoring one for BACKUP_DAYS.

export const BACKUP_DAYS = 90;

/** The details a backup holds and a restore puts back (never the link name). */
export const BACKUP_FIELDS = [
  "nameEn",
  "nameAr",
  "sectorEn",
  "sectorAr",
  "customerModel",
  "revenueModels",
  "currency",
  "entryStage",
  "currentStage",
  "department",
  "founderName",
  "founderEmail",
  "founderPhone",
  "hqCity",
  "hqCountry",
  "website",
] as const;

export type BackupField = (typeof BACKUP_FIELDS)[number];
export type CompanySnapshot = Record<BackupField, unknown>;

/** The backed-up part of a startup record. */
export function companySnapshot(company: Record<string, unknown>): CompanySnapshot {
  return Object.fromEntries(BACKUP_FIELDS.map((f) => [f, company[f] ?? null])) as CompanySnapshot;
}

export interface CompanyBackupDTO {
  id: string;
  createdAt: string;
  actorEmail: string | null;
  /** "excel_import", "edit" or "restore". */
  source: string;
  /** Fields whose saved value differs from the startup's current one. */
  differs: BackupField[];
}

const same = (a: unknown, b: unknown) =>
  Array.isArray(a) && Array.isArray(b) ? [...a].sort().join("|") === [...b].sort().join("|") : (a ?? null) === (b ?? null);

/**
 * A startup's earlier versions from the last BACKUP_DAYS days, newest
 * first, leaving out any that match its current details. Admin only.
 */
export async function getCompanyBackups(companyId: string): Promise<CompanyBackupDTO[]> {
  await requireFalakRole("FALAK_ADMIN");
  const since = new Date(Date.now() - BACKUP_DAYS * 24 * 60 * 60 * 1000);
  const [company, events] = await Promise.all([
    db.company.findUnique({ where: { id: companyId } }),
    db.auditEvent.findMany({
      where: { targetType: "Company", targetId: companyId, action: { in: ["company.updated", "company.restored"] }, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, createdAt: true, meta: true, actor: { select: { email: true } } },
    }),
  ]);
  if (!company) return [];
  const current = companySnapshot(company as unknown as Record<string, unknown>);

  const backups: CompanyBackupDTO[] = [];
  for (const e of events) {
    const meta = e.meta as { before?: Record<string, unknown>; source?: string } | null;
    if (!meta?.before) continue;
    const differs = BACKUP_FIELDS.filter((f) => f in meta.before! && !same(meta.before![f], current[f]));
    if (differs.length === 0) continue;
    backups.push({
      id: e.id,
      createdAt: e.createdAt.toISOString(),
      actorEmail: e.actor?.email ?? null,
      source: meta.source ?? "edit",
      differs,
    });
  }
  return backups;
}
