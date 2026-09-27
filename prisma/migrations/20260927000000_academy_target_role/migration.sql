-- CreateEnum
CREATE TYPE "AcademyTargetRole" AS ENUM ('MANAGER', 'CLUB_MANAGER', 'CITY_MANAGER');

-- AlterTable
-- Additive only, NOT destructive: every existing TrainingProgram row gets
-- targetRole='MANAGER' via the column default — identical to its current
-- (implicit, undifferentiated) visibility, so no existing program/course/
-- lesson content changes what it's visible to as a result of this migration
-- by itself (see academy.ts's server-side filtering, applied separately).
ALTER TABLE "training_programs" ADD COLUMN     "targetRole" "AcademyTargetRole" NOT NULL DEFAULT 'MANAGER';

-- CreateIndex
CREATE INDEX "training_programs_targetRole_idx" ON "training_programs"("targetRole");
