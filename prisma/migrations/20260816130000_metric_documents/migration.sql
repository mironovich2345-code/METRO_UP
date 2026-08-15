-- CreateEnum
CREATE TYPE "MetricDocCategory" AS ENUM ('TRAINING_MANUAL', 'CLUB_RULES', 'WORK_REGULATION', 'CONTRACT_TEMPLATE', 'SALES_MATERIAL', 'FINANCE_CASH', 'REFUNDS', 'HR', 'OTHER');

-- AlterEnum
ALTER TYPE "KnowledgeSourceType" ADD VALUE 'DOCUMENT';

-- AlterTable
ALTER TABLE "metric_messages" ADD COLUMN     "isTruncated" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "metric_knowledge_documents" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" "MetricDocCategory" NOT NULL DEFAULT 'OTHER',
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "originalFileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL DEFAULT 0,
    "storageKey" TEXT NOT NULL,
    "extractedText" TEXT NOT NULL,
    "positionScope" TEXT NOT NULL DEFAULT 'ALL',
    "versionLabel" TEXT,
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "createdByUserId" UUID NOT NULL,
    "updatedByUserId" UUID,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "metric_knowledge_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "metric_knowledge_documents_status_idx" ON "metric_knowledge_documents"("status");

-- CreateIndex
CREATE INDEX "metric_knowledge_documents_category_idx" ON "metric_knowledge_documents"("category");

