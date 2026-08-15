-- AlterTable
ALTER TABLE "metric_messages" ADD COLUMN     "seq" SERIAL NOT NULL;

-- CreateIndex
CREATE INDEX "metric_messages_conversationId_seq_idx" ON "metric_messages"("conversationId", "seq");

