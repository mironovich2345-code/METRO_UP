-- CreateEnum
CREATE TYPE "RatingAuditAction" AS ENUM ('SALES_CREATE', 'SALES_UPDATE', 'MYSTERY_CREATE', 'MYSTERY_UPDATE', 'MYSTERY_PUBLISH', 'ELIGIBILITY_CHANGE', 'RATING_CALCULATE', 'RATING_PUBLISH', 'RATING_REOPEN');

-- CreateTable
CREATE TABLE "rating_periods" (
    "id" UUID NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "status" "RatingStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "calculatedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "publishedByUserId" UUID,

    CONSTRAINT "rating_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rating_eligibility" (
    "id" UUID NOT NULL,
    "employeeUserId" UUID NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "isEligible" BOOLEAN NOT NULL DEFAULT true,
    "reason" TEXT,
    "updatedByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rating_eligibility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rating_audit_logs" (
    "id" UUID NOT NULL,
    "actorUserId" UUID NOT NULL,
    "action" "RatingAuditAction" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "month" INTEGER,
    "year" INTEGER,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rating_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rating_periods_status_idx" ON "rating_periods"("status");

-- CreateIndex
CREATE UNIQUE INDEX "rating_periods_month_year_key" ON "rating_periods"("month", "year");

-- CreateIndex
CREATE INDEX "rating_eligibility_month_year_idx" ON "rating_eligibility"("month", "year");

-- CreateIndex
CREATE UNIQUE INDEX "rating_eligibility_employeeUserId_month_year_key" ON "rating_eligibility"("employeeUserId", "month", "year");

-- CreateIndex
CREATE INDEX "rating_audit_logs_month_year_idx" ON "rating_audit_logs"("month", "year");

-- CreateIndex
CREATE INDEX "rating_audit_logs_actorUserId_idx" ON "rating_audit_logs"("actorUserId");

