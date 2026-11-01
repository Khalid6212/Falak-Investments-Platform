-- DropIndex
DROP INDEX "reporting_cycles_companyId_templateId_periodStart_periodEnd_key";

-- AlterTable
ALTER TABLE "reporting_cycles" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedKey" TEXT NOT NULL DEFAULT '';

-- CreateIndex
CREATE UNIQUE INDEX "reporting_cycles_companyId_templateId_periodStart_periodEnd_key" ON "reporting_cycles"("companyId", "templateId", "periodStart", "periodEnd", "deletedKey");

