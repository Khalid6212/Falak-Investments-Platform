"use client";

import Link from "next/link";
import { Table, THead, TBody, Tr, Th, Td } from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { Num } from "@/components/ui/Num";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { formatCurrency, formatDate, formatPercent } from "@/lib/format";
import { useListView, byText, byValue } from "@/components/lists/useListView";
import { unassignInvestorFromVehicleAction } from "../../actions";
import type { InvestorVehicleAssignmentRow } from "@/lib/admin/investor-vehicle-assignments";

const COLUMN_COUNT = 7;

export function InvestorVehicleAssignmentsTable({ rows }: { rows: InvestorVehicleAssignmentRow[] }) {
  const { t, lang } = useLanguage();
  const investorName = (r: InvestorVehicleAssignmentRow) => (lang === "ar" ? r.investorNameAr : r.investorNameEn);
  const vehicleName = (r: InvestorVehicleAssignmentRow) => (lang === "ar" ? r.vehicleNameAr : r.vehicleNameEn);
  const { visible, controls, empty } = useListView(rows, {
    id: "investor-vehicle-assignments",
    searchText: (r) => `${r.investorNameEn} ${r.investorNameAr} ${r.vehicleNameEn} ${r.vehicleNameAr}`,
    sorts: [
      byValue("newest", t.lists.newestFirst, (r) => r.effectiveFrom, true),
      byValue("oldest", t.lists.oldestFirst, (r) => r.effectiveFrom),
      byText("nameAsc", t.lists.nameAsc, investorName),
      byText("vehicle", t.admin.manage.vehicleLabel, vehicleName),
      byValue("amountDesc", t.lists.amountDesc, (r) => r.commitmentAmount, true),
      byValue("ownershipDesc", t.lists.ownershipDesc, (r) => r.ownershipPct, true),
    ],
  });

  return (
    <div className="flex flex-col gap-2">
      {rows.length > 0 ? controls : null}
      {empty}
      <Table caption={t.admin.manage.investorVehicleAssignmentsCaption}>
        <THead>
          <Tr>
            <Th>{t.admin.manage.investorLabel}</Th>
            <Th>{t.admin.manage.vehicleLabel}</Th>
            <Th>{t.admin.manage.commitmentAmountLabel}</Th>
            <Th>{t.admin.manage.ownershipPctLabel}</Th>
            <Th>{t.admin.manage.effectiveFromLabel}</Th>
            <Th>{t.admin.manage.exposureColumn}</Th>
            <Th>
              <span className="sr-only">{t.admin.manage.archiveAction}</span>
            </Th>
          </Tr>
        </THead>
        <TBody>
          {rows.length === 0 ? (
            <Tr>
              <Td colSpan={COLUMN_COUNT} className="py-8 text-center text-muted-foreground">
                {t.admin.emptyState}
              </Td>
            </Tr>
          ) : (
            visible.map((row) => (
              <Tr key={row.id}>
                <Td>{investorName(row)}</Td>
                <Td>{vehicleName(row)}</Td>
                <Td>{row.commitmentAmount === null ? t.admin.table.noDataValue : <Num>{formatCurrency(row.commitmentAmount, row.currency, lang)}</Num>}</Td>
                <Td>{row.ownershipPct === null ? t.admin.table.noDataValue : <Num>{formatPercent(row.ownershipPct, lang)}</Num>}</Td>
                <Td>{formatDate(row.effectiveFrom, lang)}</Td>
                <Td>
                  <div className="flex flex-col items-start gap-1">
                    <span className="whitespace-nowrap text-xs text-muted-foreground">
                      {row.exposureScope === "ALL_STARTUPS"
                        ? t.admin.manage.exposureAllValue
                        : t.admin.manage.exposureSelectedValue.replace("{count}", String(row.exposedStartupCount))}
                    </span>
                    <Link
                      href={`/admin/manage/investor-vehicle-assignment/${row.id}`}
                      className="chamfer-br-sm inline-flex whitespace-nowrap px-2 py-1 text-xs font-bold text-foreground shadow-[inset_0_0_0_2px_var(--brand-dark-nebula)] hover:bg-surface-muted"
                    >
                      {t.admin.manage.manageStartupsAction}
                    </Link>
                  </div>
                </Td>
                <Td>
                  <form action={unassignInvestorFromVehicleAction}>
                    <input type="hidden" name="positionId" value={row.id} />
                    <Button type="submit" variant="outline" size="sm">
                      {t.admin.manage.unassignAction}
                    </Button>
                  </form>
                </Td>
              </Tr>
            ))
          )}
        </TBody>
      </Table>
    </div>
  );
}
