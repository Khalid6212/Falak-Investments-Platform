"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import type { Dictionary } from "@/lib/i18n/dictionary";

interface SubNavItem {
  key: keyof Pick<
    Dictionary["admin"]["manage"],
    | "createCompanyTitle"
    | "createVehicleTitle"
    | "createInvestorTitle"
    | "createTemplateTitle"
    | "createCycleTitle"
    | "invitesSectionTitle"
    | "vehicleAssignmentTitle"
    | "recordCompanyValuationTitle"
    | "recordVehicleValuationTitle"
    | "recordCapitalTransactionTitle"
    | "auditLogTitle"
    | "setDepartmentTitle"
    | "setVintageYearTitle"
    | "investorVehicleAssignmentTitle"
  >;
  href: string;
  /** Pages under this path also highlight the item. */
  activeUnder?: string;
}

const SUB_NAV_ITEMS: SubNavItem[] = [
  { key: "createCompanyTitle", href: "/admin/manage/new-company" },
  { key: "createVehicleTitle", href: "/admin/manage/new-vehicle" },
  { key: "createInvestorTitle", href: "/admin/manage/new-investor" },
  { key: "createTemplateTitle", href: "/admin/manage/new-reporting-template" },
  { key: "createCycleTitle", href: "/admin/manage/new-reporting-cycle", activeUnder: "/admin/manage/reporting-requests/" },
  { key: "invitesSectionTitle", href: "/admin/manage/invites" },
  { key: "vehicleAssignmentTitle", href: "/admin/manage/vehicle-assignment" },
  { key: "investorVehicleAssignmentTitle", href: "/admin/manage/investor-vehicle-assignment", activeUnder: "/admin/manage/investor-vehicle-assignment/" },
  { key: "recordCompanyValuationTitle", href: "/admin/manage/company-valuation" },
  { key: "recordVehicleValuationTitle", href: "/admin/manage/vehicle-valuation" },
  { key: "recordCapitalTransactionTitle", href: "/admin/manage/capital-transaction" },
  { key: "setDepartmentTitle", href: "/admin/manage/set-company-department" },
  { key: "setVintageYearTitle", href: "/admin/manage/set-vehicle-vintage-year" },
  { key: "auditLogTitle", href: "/admin/manage/audit-log" },
];

// Mirrors Sidebar.tsx's own activeHref pattern: these nine routes never
// nest inside one another, so a plain equality check is enough (no
// longest-prefix-match needed the way the top-level Sidebar nav needs it
// for /admin vs /admin/manage).
export function ManageSubNav() {
  const { t } = useLanguage();
  const pathname = usePathname();

  return (
    <nav aria-label={t.admin.manage.sectionTitle} className="flex flex-wrap gap-2">
      <Link
        href="/admin/manage"
        aria-current={pathname === "/admin/manage" ? "page" : undefined}
        className={`chamfer-br-sm px-3 py-1.5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-link-foreground ${
          pathname === "/admin/manage"
            ? "bg-nebula-aqua text-dark-green"
            : "text-foreground shadow-[inset_0_0_0_1px_var(--control-border)] hover:bg-surface-muted"
        }`}
      >
        {t.admin.manage.sectionTitle}
      </Link>
      {SUB_NAV_ITEMS.map((item) => {
        const isActive = pathname === item.href || (item.activeUnder !== undefined && pathname.startsWith(item.activeUnder));
        return (
          <Link
            key={item.key}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={`chamfer-br-sm px-3 py-1.5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-link-foreground ${
              isActive
                ? "bg-nebula-aqua text-dark-green"
                : "text-foreground shadow-[inset_0_0_0_1px_var(--control-border)] hover:bg-surface-muted"
            }`}
          >
            {t.admin.manage[item.key]}
          </Link>
        );
      })}
    </nav>
  );
}
