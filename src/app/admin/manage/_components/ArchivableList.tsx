"use client";

import Link from "next/link";
import { RefreshingForm } from "@/components/forms/RefreshingForm";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { Button } from "@/components/ui/Button";
import { useListView, byText, byValue } from "@/components/lists/useListView";

interface Item {
  id: string;
  nameEn: string;
  nameAr: string;
  archivedAt: string | null;
  updatedAt: string;
}

export function ArchivableList({
  items,
  action,
  fieldName,
  editBasePath,
}: {
  items: Item[];
  action: (formData: FormData) => Promise<void>;
  fieldName: string;
  // Each row links to `${editBasePath}/${id}` when given.
  editBasePath?: string;
}) {
  const { t, lang } = useLanguage();
  const active = items.filter((i) => !i.archivedAt);
  const name = (i: Item) => (lang === "ar" ? i.nameAr : i.nameEn);
  const { visible, controls, empty } = useListView(active, {
    id: `list-${fieldName}`,
    searchText: (i) => `${i.nameEn} ${i.nameAr}`,
    // Newly added or edited records first, by default.
    sorts: [
      byValue("recent", t.lists.recentlyUpdated, (i) => i.updatedAt, true),
      byText("nameAsc", t.lists.nameAsc, name),
      byText("nameDesc", t.lists.nameDesc, name, true),
      byValue("oldest", t.lists.oldestFirst, (i) => i.updatedAt),
    ],
  });

  if (active.length === 0) {
    return <p className="text-xs text-muted-foreground">{t.admin.emptyState}</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {controls}
      {empty}
      <ul className="chamfer-br-md divide-y divide-border-subtle shadow-[var(--inner-line)]">
        {visible.map((item) => (
          <li key={item.id} className="flex items-center justify-between gap-3 px-3 py-2">
            <span className="text-sm text-foreground">{name(item)}</span>
            <div className="flex items-center gap-2">
              {editBasePath ? (
                <Link
                  href={`${editBasePath}/${item.id}`}
                  className="chamfer-br-sm inline-flex items-center px-2 py-1 text-xs font-bold text-link-foreground shadow-[inset_0_0_0_2px_var(--brand-dark-nebula)] hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-link-foreground"
                >
                  {t.admin.manage.editAction}
                </Link>
              ) : null}
              <RefreshingForm action={action}>
                <input type="hidden" name={fieldName} value={item.id} />
                <Button type="submit" variant="outline" size="xs">
                  {t.admin.manage.archiveAction}
                </Button>
              </RefreshingForm>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
