"use client";

import Link from "next/link";
import { Table, THead, TBody, Tr, Th, Td } from "@/components/ui/Table";
import { Num } from "@/components/ui/Num";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { formatCurrency } from "@/lib/format";
import type { DisplayCurrency } from "@/lib/currency/convert";
import type { VehicleCapTable } from "@/lib/vehicle/cap-table-compute";

interface VehicleDifferenceProps {
  capTable: VehicleCapTable;
  displayCurrency: DisplayCurrency;
  vehicleSlug: string;
}

// The Invested Capital card and the cap table add up separate records, so
// a gap between them usually means an entry to check. The startup rows can
// show gaps even when the totals happen to match.
export function VehicleDifference({ capTable, displayCurrency, vehicleSlug }: VehicleDifferenceProps) {
  const { t, lang } = useLanguage();
  const v = t.vehicleReport;
  const money = (n: number) => <Num>{formatCurrency(n, displayCurrency, lang)}</Num>;
  const signed = (n: number) => (
    <Num>
      {n > 0 ? "+" : ""}
      {formatCurrency(n, displayCurrency, lang)}
    </Num>
  );

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-foreground">
        <span className="font-medium">{v.differenceLabel}: </span>
        {capTable.difference === 0 ? (
          <span className="text-muted-foreground">{v.differenceNone}</span>
        ) : (
          <span className="font-semibold text-danger">{signed(capTable.difference)}</span>
        )}
      </p>
      {capTable.differenceRows.length > 0 ? (
        <>
          <p className="text-xs text-muted-foreground">{v.differenceHint}</p>
          <Table
            caption={v.differenceLabel}
            className="[&_td]:px-3 [&_td]:py-2 [&_td]:whitespace-nowrap [&_th]:px-3 [&_th]:py-2 [&_th]:whitespace-nowrap"
          >
            <THead>
              <Tr>
                <Th>{v.differenceStartupColumn}</Th>
                <Th>{v.investedCapitalLabel}</Th>
                <Th>{v.differenceCapTableColumn}</Th>
                <Th>{v.differenceLabel}</Th>
              </Tr>
            </THead>
            <TBody>
              {capTable.differenceRows.map((r) => (
                <Tr key={r.companyId ?? "unassigned"}>
                  <Td className="font-medium">
                    {r.slug ? (
                      <Link href={`/company/${r.slug}?fromVehicle=${vehicleSlug}`} className="text-link-foreground underline-offset-2 hover:underline">
                        {lang === "ar" ? r.nameAr : r.nameEn}
                      </Link>
                    ) : (
                      v.differenceUnassigned
                    )}
                  </Td>
                  <Td>{money(r.invested)}</Td>
                  <Td>{money(r.contributed)}</Td>
                  <Td className="font-semibold text-danger">{signed(r.difference)}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </>
      ) : null}
    </div>
  );
}
