import "server-only";
import { db } from "@/lib/db";
import { requireFalakRole } from "@/lib/auth/authorization";
import { positionContributions, type MoneyAmount, type VehicleCapitalOverview, type VehicleCapTableInvestorRaw } from "@/lib/vehicle/cap-table-compute";

const INVESTED_STATUSES = ["Active", "Superseded"] as const;

/**
 * Raw, per-currency inputs for the vehicle dashboard's Invested Capital
 * card and cap table -- conversion to the display currency happens
 * client-side (computeVehicleCapTable) so the currency picker is instant.
 *
 * - Invested capital: every Active/Superseded investment agreement the
 *   vehicle holds (same definition linkInvestorToVehicleAction uses to
 *   derive an investor's ownership %).
 * - Per investor: contributions from their Active positions (see
 *   positionContributions), and management fees recorded against this vehicle.
 */
export async function getVehicleCapitalOverview(vehicleId: string): Promise<VehicleCapitalOverview> {
  await requireFalakRole("FALAK_OPERATIONS");

  const [agreements, positions, fees] = await Promise.all([
    db.investmentAgreement.findMany({
      where: { status: { in: [...INVESTED_STATUSES] }, ownershipPosition: { vehicleId } },
      select: { investedAmount: true, currency: true },
    }),
    db.investorVehiclePosition.findMany({
      where: { vehicleId, status: "Active", investor: { archivedAt: null } },
      select: {
        commitmentAmount: true,
        ownershipPct: true,
        currency: true,
        startupExposures: { where: { status: "Active" }, select: { investedAmount: true, currency: true } },
        investor: { select: { id: true, nameEn: true, nameAr: true } },
      },
    }),
    db.investorCapitalTransaction.findMany({
      where: { vehicleId, type: "ManagementFee" },
      select: { investorId: true, amount: true, currency: true },
    }),
  ]);

  const investedCapital: MoneyAmount[] = agreements
    .filter((a) => a.investedAmount !== null && a.currency !== null)
    .map((a) => ({ amount: a.investedAmount!.toNumber(), currency: a.currency! }));

  // An investor can hold several Active positions on one vehicle (e.g. a
  // top-up at a later effectiveFrom) -- they are one cap-table row.
  const byInvestor = new Map<string, VehicleCapTableInvestorRaw>();
  for (const p of positions) {
    const row = byInvestor.get(p.investor.id) ?? {
      investorId: p.investor.id,
      nameEn: p.investor.nameEn,
      nameAr: p.investor.nameAr,
      contributions: [],
      managementFees: [],
      storedOwnershipPct: null,
    };
    row.contributions.push(...positionContributions(p));
    if (p.ownershipPct !== null) {
      row.storedOwnershipPct = (row.storedOwnershipPct ?? 0) + p.ownershipPct.toNumber();
    }
    byInvestor.set(p.investor.id, row);
  }
  for (const fee of fees) {
    byInvestor.get(fee.investorId)?.managementFees.push({ amount: fee.amount.toNumber(), currency: fee.currency });
  }

  return { investedCapital, investors: [...byInvestor.values()] };
}
