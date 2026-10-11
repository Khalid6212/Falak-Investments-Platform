-- CreateEnum
CREATE TYPE "ExposureScope" AS ENUM ('ALL_STARTUPS', 'SELECTED');

-- CreateEnum
CREATE TYPE "InvestorParticipation" AS ENUM ('NETWORK_MEMBER', 'SYNDICATE_MEMBER');

-- AlterTable
ALTER TABLE "investor_vehicle_positions" ADD COLUMN     "exposureScope" "ExposureScope" NOT NULL DEFAULT 'ALL_STARTUPS';

-- CreateTable
CREATE TABLE "investor_startup_exposures" (
    "id" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "investorId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "investedAmount" DECIMAL(18,4),
    "currency" "Currency",
    "ownershipPct" DECIMAL(7,4),
    "participation" "InvestorParticipation",
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "status" "PositionStatus" NOT NULL DEFAULT 'Active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "investor_startup_exposures_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "investor_startup_exposures_positionId_idx" ON "investor_startup_exposures"("positionId");

-- CreateIndex
CREATE INDEX "investor_startup_exposures_investorId_idx" ON "investor_startup_exposures"("investorId");

-- CreateIndex
CREATE INDEX "investor_startup_exposures_companyId_idx" ON "investor_startup_exposures"("companyId");

-- AddForeignKey
ALTER TABLE "investor_startup_exposures" ADD CONSTRAINT "investor_startup_exposures_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "investor_vehicle_positions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investor_startup_exposures" ADD CONSTRAINT "investor_startup_exposures_investorId_fkey" FOREIGN KEY ("investorId") REFERENCES "investors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investor_startup_exposures" ADD CONSTRAINT "investor_startup_exposures_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
