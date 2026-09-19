-- AlterTable
ALTER TABLE "user_audit_logs" ADD COLUMN     "cityId" TEXT,
ADD COLUMN     "clubId" TEXT,
ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "reason" TEXT;

-- CreateIndex
CREATE INDEX "user_audit_logs_action_createdAt_idx" ON "user_audit_logs"("action", "createdAt");

