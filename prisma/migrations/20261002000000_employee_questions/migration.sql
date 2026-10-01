-- AlterEnum
-- Additive only — existing AuditAction values/rows are untouched. Postgres
-- 12+ allows ADD VALUE inside a transaction as long as the new value isn't
-- used by DML in the same transaction (it isn't here).
ALTER TYPE "AuditAction" ADD VALUE 'QUESTION_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'QUESTION_STATUS_CHANGED';

-- CreateEnum
CREATE TYPE "QuestionCategory" AS ENUM ('WORK_PROCESSES', 'TRAINING', 'MANAGEMENT', 'WORKING_CONDITIONS', 'TECHNICAL', 'IDEA', 'OTHER');

-- CreateEnum
CREATE TYPE "QuestionStatus" AS ENUM ('NEW', 'IN_PROGRESS', 'CLOSED');

-- CreateTable
CREATE TABLE "employee_questions" (
    "id" UUID NOT NULL,
    "authorUserId" UUID NOT NULL,
    "senderRole" "NetworkRole" NOT NULL,
    "category" "QuestionCategory" NOT NULL,
    "text" TEXT NOT NULL,
    "anonymous" BOOLEAN NOT NULL DEFAULT false,
    "status" "QuestionStatus" NOT NULL DEFAULT 'NEW',
    "cityIdSnapshot" TEXT NOT NULL,
    "cityNameSnapshot" TEXT NOT NULL,
    "clubIdSnapshot" TEXT,
    "clubNameSnapshot" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_question_attachments" (
    "id" UUID NOT NULL,
    "questionId" UUID NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_question_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "employee_questions_status_idx" ON "employee_questions"("status");

-- CreateIndex
CREATE INDEX "employee_questions_authorUserId_idx" ON "employee_questions"("authorUserId");

-- CreateIndex
CREATE INDEX "employee_questions_createdAt_idx" ON "employee_questions"("createdAt");

-- CreateIndex
CREATE INDEX "employee_questions_cityIdSnapshot_status_idx" ON "employee_questions"("cityIdSnapshot", "status");

-- CreateIndex
CREATE INDEX "employee_questions_clubIdSnapshot_idx" ON "employee_questions"("clubIdSnapshot");

-- CreateIndex
CREATE UNIQUE INDEX "employee_question_attachments_storageKey_key" ON "employee_question_attachments"("storageKey");

-- CreateIndex
CREATE INDEX "employee_question_attachments_questionId_idx" ON "employee_question_attachments"("questionId");

-- AddForeignKey
ALTER TABLE "employee_questions" ADD CONSTRAINT "employee_questions_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_question_attachments" ADD CONSTRAINT "employee_question_attachments_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "employee_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
