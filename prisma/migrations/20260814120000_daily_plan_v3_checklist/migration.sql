-- CreateEnum
CREATE TYPE "DailyTaskPriority" AS ENUM ('NORMAL', 'HIGH');

-- AlterTable
ALTER TABLE "daily_tasks" ADD COLUMN     "priority" "DailyTaskPriority" NOT NULL DEFAULT 'NORMAL',
ADD COLUMN     "timeHint" TEXT;

-- AlterTable
ALTER TABLE "club_task_templates" ADD COLUMN     "checklist" JSONB,
ADD COLUMN     "code" TEXT,
ADD COLUMN     "priority" "DailyTaskPriority" NOT NULL DEFAULT 'NORMAL',
ADD COLUMN     "timeHint" TEXT,
ALTER COLUMN "createdByUserId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "daily_task_checklist_items" (
    "id" UUID NOT NULL,
    "dailyTaskId" UUID NOT NULL,
    "itemId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "doneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_task_checklist_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "daily_task_checklist_items_dailyTaskId_idx" ON "daily_task_checklist_items"("dailyTaskId");

-- CreateIndex
CREATE UNIQUE INDEX "daily_task_checklist_items_dailyTaskId_itemId_key" ON "daily_task_checklist_items"("dailyTaskId", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "club_task_templates_clubId_code_key" ON "club_task_templates"("clubId", "code");

-- AddForeignKey
ALTER TABLE "daily_task_checklist_items" ADD CONSTRAINT "daily_task_checklist_items_dailyTaskId_fkey" FOREIGN KEY ("dailyTaskId") REFERENCES "daily_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

