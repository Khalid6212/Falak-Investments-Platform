-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "InvestorParticipation" ADD VALUE 'FALAK_TEAM';
ALTER TYPE "InvestorParticipation" ADD VALUE 'FALAK';

-- CreateTable
CREATE TABLE "report_form_links" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "report_form_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "report_form_links_tokenHash_key" ON "report_form_links"("tokenHash");

-- CreateIndex
CREATE INDEX "report_form_links_cycleId_idx" ON "report_form_links"("cycleId");

-- AddForeignKey
ALTER TABLE "report_form_links" ADD CONSTRAINT "report_form_links_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "reporting_cycles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
