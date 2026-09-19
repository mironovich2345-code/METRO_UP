-- CreateEnum
CREATE TYPE "NetworkRole" AS ENUM ('PROJECT_ADMIN', 'OPERATIONS_DIRECTOR', 'CITY_MANAGER', 'CLUB_MANAGER', 'MANAGER');

-- CreateEnum
CREATE TYPE "RoleScopeType" AS ENUM ('SYSTEM', 'NETWORK', 'CITY', 'CLUB');

-- CreateEnum
CREATE TYPE "RoleAssignmentStatus" AS ENUM ('PENDING_APPROVAL', 'ACTIVE', 'SUSPENDED', 'ENDED');

-- CreateTable
CREATE TABLE "role_assignments" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "NetworkRole" NOT NULL,
    "scopeType" "RoleScopeType" NOT NULL,
    "cityId" TEXT,
    "clubId" TEXT,
    "status" "RoleAssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "assignedByUserId" UUID,
    "reason" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "role_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "role_assignments_userId_status_idx" ON "role_assignments"("userId", "status");

-- CreateIndex
CREATE INDEX "role_assignments_role_scopeType_cityId_status_idx" ON "role_assignments"("role", "scopeType", "cityId", "status");

-- CreateIndex
CREATE INDEX "role_assignments_role_scopeType_clubId_status_idx" ON "role_assignments"("role", "scopeType", "clubId", "status");

-- AddForeignKey
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "cities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "clubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-written addition (Prisma's schema language has no way to express a
-- partial/filtered unique index) — this is the DB-level backstop against two
-- concurrently-ACTIVE, otherwise-identical RoleAssignment rows for the same
-- (user, role, scope). Postgres treats NULL <> NULL in a plain unique index,
-- so SYSTEM/NETWORK-scoped rows (cityId AND clubId both NULL) would never
-- collide without normalizing the two nullable columns via COALESCE first.
-- The index is scoped to status = 'ACTIVE' only (PENDING_APPROVAL/SUSPENDED/
-- ENDED rows are historical/pending and must remain freely insertable even
-- when an ACTIVE row already exists for the same scope — e.g. a queued
-- re-approval after a suspension).
CREATE UNIQUE INDEX "role_assignments_active_scope_unique"
  ON "role_assignments" ("userId", "role", "scopeType", COALESCE("cityId", ''), COALESCE("clubId", ''))
  WHERE "status" = 'ACTIVE';

