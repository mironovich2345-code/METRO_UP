-- CreateEnum
CREATE TYPE "MetricUsageKind" AS ENUM ('CHAT', 'CONTINUE');

-- CreateEnum
CREATE TYPE "TelemetrySurface" AS ENUM ('MINI_APP', 'CONTROL', 'SPM');

-- CreateTable
CREATE TABLE "metric_usage_events" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "kind" "MetricUsageKind" NOT NULL,
    "inputTokens" INTEGER,
    "cachedInputTokens" INTEGER,
    "outputTokens" INTEGER,
    "totalTokens" INTEGER,
    "fileSearchCalls" INTEGER NOT NULL DEFAULT 0,
    "costMicroUsd" INTEGER,
    "pricingVersion" TEXT,
    "userId" UUID,
    "conversationId" UUID,
    "messageId" UUID,

    CONSTRAINT "metric_usage_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "page_view_events" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" UUID NOT NULL,
    "surface" "TelemetrySurface" NOT NULL,
    "screenKey" TEXT NOT NULL,

    CONSTRAINT "page_view_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "metric_usage_events_createdAt_idx" ON "metric_usage_events"("createdAt");

-- CreateIndex
CREATE INDEX "page_view_events_createdAt_idx" ON "page_view_events"("createdAt");

-- CreateIndex
CREATE INDEX "page_view_events_screenKey_createdAt_idx" ON "page_view_events"("screenKey", "createdAt");

-- CreateIndex
CREATE INDEX "metric_messages_role_createdAt_idx" ON "metric_messages"("role", "createdAt");

