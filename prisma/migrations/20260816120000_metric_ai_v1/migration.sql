-- CreateEnum
CREATE TYPE "KnowledgeSourceType" AS ENUM ('ACADEMY', 'SCRIPT', 'INSTRUCTION');

-- CreateEnum
CREATE TYPE "KnowledgeSyncStatus" AS ENUM ('PENDING', 'SYNCED', 'FAILED');

-- CreateEnum
CREATE TYPE "MetricMessageRole" AS ENUM ('USER', 'ASSISTANT');

-- CreateTable
CREATE TABLE "knowledge_sync_records" (
    "id" UUID NOT NULL,
    "sourceType" "KnowledgeSourceType" NOT NULL,
    "sourceId" UUID NOT NULL,
    "sourceUpdatedAt" TIMESTAMP(3) NOT NULL,
    "status" "KnowledgeSyncStatus" NOT NULL DEFAULT 'PENDING',
    "positionScope" TEXT NOT NULL DEFAULT 'ALL',
    "openaiFileId" TEXT,
    "vectorStoreFileId" TEXT,
    "lastErrorSafe" TEXT,
    "syncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_sync_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metric_conversations" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "title" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "metric_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metric_messages" (
    "id" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "role" "MetricMessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "sources" JSONB,
    "openaiResponseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "metric_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "knowledge_sync_records_status_idx" ON "knowledge_sync_records"("status");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_sync_records_sourceType_sourceId_key" ON "knowledge_sync_records"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "metric_conversations_userId_updatedAt_idx" ON "metric_conversations"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "metric_messages_conversationId_createdAt_idx" ON "metric_messages"("conversationId", "createdAt");

-- AddForeignKey
ALTER TABLE "metric_conversations" ADD CONSTRAINT "metric_conversations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metric_messages" ADD CONSTRAINT "metric_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "metric_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

