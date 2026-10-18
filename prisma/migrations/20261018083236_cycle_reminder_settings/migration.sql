-- AlterTable
ALTER TABLE "reporting_cycles" ADD COLUMN     "overdueEveryDays" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "overdueForDays" INTEGER NOT NULL DEFAULT 14,
ADD COLUMN     "overdueRemindersEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reminderEveryDays" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "reminderStartDays" INTEGER NOT NULL DEFAULT 7,
ADD COLUMN     "remindersEnabled" BOOLEAN NOT NULL DEFAULT false;
