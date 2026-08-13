-- AlterEnum
ALTER TYPE "DailyTaskCategory" ADD VALUE 'MANAGER';

-- AlterEnum
ALTER TYPE "DailyTaskSource" ADD VALUE 'MANAGER';

-- AlterTable
ALTER TABLE "daily_tasks" ADD COLUMN     "clubTaskTemplateId" UUID,
ADD COLUMN     "createdByUserId" UUID,
ADD COLUMN     "required" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "club_task_templates" (
    "id" UUID NOT NULL,
    "clubId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "targetPosition" "EmployeePosition",
    "required" BOOLEAN NOT NULL DEFAULT false,
    "defaultOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "club_task_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "club_task_templates_clubId_isActive_idx" ON "club_task_templates"("clubId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "daily_tasks_userId_date_clubTaskTemplateId_key" ON "daily_tasks"("userId", "date", "clubTaskTemplateId");

-- AddForeignKey
ALTER TABLE "daily_tasks" ADD CONSTRAINT "daily_tasks_clubTaskTemplateId_fkey" FOREIGN KEY ("clubTaskTemplateId") REFERENCES "club_task_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_task_templates" ADD CONSTRAINT "club_task_templates_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

