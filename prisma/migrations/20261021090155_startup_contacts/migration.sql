-- CreateEnum
CREATE TYPE "ContactDelivery" AS ENUM ('TO', 'CC', 'NONE');

-- CreateTable
CREATE TABLE "startup_contacts" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT,
    "delivery" "ContactDelivery" NOT NULL DEFAULT 'TO',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "startup_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "startup_contacts_companyId_idx" ON "startup_contacts"("companyId");

-- AddForeignKey
ALTER TABLE "startup_contacts" ADD CONSTRAINT "startup_contacts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: each startup starts with the people its report emails already
-- go to -- the founder email on its record, then its active platform users
-- -- all as "To", so nothing changes until staff edit the list.
INSERT INTO "startup_contacts" ("id", "companyId", "name", "email", "role", "delivery", "sortOrder", "updatedAt")
SELECT 'sc_' || md5(c."id" || ':founder'), c."id",
       COALESCE(NULLIF(TRIM(c."founderName"), ''), 'Founder'),
       LOWER(TRIM(c."founderEmail")), 'Founder', 'TO', 0, CURRENT_TIMESTAMP
FROM "companies" c
WHERE c."deletedAt" IS NULL AND NULLIF(TRIM(c."founderEmail"), '') IS NOT NULL;

INSERT INTO "startup_contacts" ("id", "companyId", "name", "email", "role", "delivery", "sortOrder", "updatedAt")
SELECT DISTINCT ON (m."companyId", LOWER(u."email"))
       'sc_' || md5(m."companyId" || ':' || LOWER(u."email")), m."companyId",
       LOWER(u."email"), LOWER(u."email"), NULL, 'TO', 1, CURRENT_TIMESTAMP
FROM "company_memberships" m
JOIN "users" u ON u."id" = m."userId"
JOIN "companies" c ON c."id" = m."companyId"
WHERE m."revokedAt" IS NULL AND u."deactivatedAt" IS NULL AND c."deletedAt" IS NULL
  AND LOWER(u."email") IS DISTINCT FROM LOWER(TRIM(c."founderEmail"));
