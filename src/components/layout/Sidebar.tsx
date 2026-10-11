"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ListChecks,
  Settings2,
  PieChart,
  Landmark,
  Building2,
  ClipboardList,
  ShieldCheck,
  KeyRound,
  type LucideIcon,
} from "lucide-react";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { useViewerNavFlags } from "@/lib/auth/ViewerNavFlagsProvider";
import { BrandMark } from "@/components/brand/BrandMark";
import type { Dictionary } from "@/lib/i18n/dictionary";
import type { ViewerNavFlags } from "@/lib/auth/viewer-roles";

type NavRequirement = keyof ViewerNavFlags;

interface NavItemConfig {
  key: keyof Pick<
    Dictionary["nav"],
    | "portfolioDashboard"
    | "companyList"
    | "managePortfolio"
    | "investorDashboard"
    | "vehicleDashboard"
    | "companyReports"
    | "startupForm"
    | "reviewWorkspace"
    | "access"
  >;
  href: string;
  Icon: LucideIcon;
  // Every route behind each of these items is already gated server-side
  // to exactly this requirement (requireFalakRole("FALAK_OPERATIONS") for
  // every /admin* + /vehicle + /company + /review route, real company/
  // investor membership for /submit + /investor) -- this only decides
  // whether to even show the link, never the real access decision.
  requires: NavRequirement;
}

const NAV_ITEMS: NavItemConfig[] = [
  { key: "portfolioDashboard", href: "/admin", Icon: LayoutDashboard, requires: "isManagementOrAdmin" },
  { key: "companyList", href: "/admin/companies", Icon: ListChecks, requires: "isFalakStaff" },
  { key: "managePortfolio", href: "/admin/manage", Icon: Settings2, requires: "isFalakStaff" },
  { key: "investorDashboard", href: "/investor", Icon: PieChart, requires: "isInvestorMember" },
  { key: "vehicleDashboard", href: "/vehicle", Icon: Landmark, requires: "isFalakStaff" },
  { key: "companyReports", href: "/company", Icon: Building2, requires: "isFalakStaff" },
  { key: "startupForm", href: "/submit", Icon: ClipboardList, requires: "isCompanyMember" },
  { key: "reviewWorkspace", href: "/review", Icon: ShieldCheck, requires: "isFalakStaff" },
  { key: "access", href: "/admin/access", Icon: KeyRound, requires: "isFalakStaff" },
];

// The single item whose href is the longest segment-wise prefix of the
// current path -- so /admin/access highlights "Access" only, not also
// "Portfolio Overview" (/admin).
function activeHref(pathname: string | null): string | null {
  if (!pathname) return null;
  const matches = NAV_ITEMS.map((i) => i.href).filter((h) => pathname === h || pathname.startsWith(`${h}/`));
  return matches.sort((a, b) => b.length - a.length)[0] ?? null;
}

export function SidebarNavList({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useLanguage();
  const pathname = usePathname();
  const flags = useViewerNavFlags();
  const current = activeHref(pathname);
  const visibleItems = NAV_ITEMS.filter((item) => flags[item.requires]);

  return (
    <nav aria-label={t.common.appName} className="flex flex-col gap-1 p-3">
      {visibleItems.map((item) => {
        const isActive = item.href === current;
        const label = t.nav[item.key];

        return (
          <Link
            key={item.key}
            href={item.href}
            onClick={onNavigate}
            aria-current={isActive ? "page" : undefined}
            className={`chamfer-br-sm flex items-center gap-3 px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nebula-aqua ${
              isActive ? "bg-white/10 text-nav-fg" : "text-nav-fg-muted hover:bg-white/5 hover:text-nav-fg"
            }`}
          >
            <item.Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function Sidebar() {
  return (
    <aside className="hidden w-64 shrink-0 flex-col bg-nav-bg xl:flex xl:sticky xl:top-0 xl:h-screen xl:self-start xl:overflow-y-auto">
      <div className="p-4">
        <BrandMark variant="on-dark" />
      </div>
      <SidebarNavList />
    </aside>
  );
}
