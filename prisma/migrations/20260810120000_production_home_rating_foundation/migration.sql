-- CreateEnum
CREATE TYPE "DailyTaskCategory" AS ENUM ('LEARNING', 'SALES', 'CLIENTS', 'SERVICE', 'SHIFT');

-- CreateEnum
CREATE TYPE "DailyTaskStatus" AS ENUM ('TODO', 'COMPLETED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "DailyTaskSource" AS ENUM ('SYSTEM', 'ADMIN', 'FUTURE_INTEGRATION');

-- CreateEnum
CREATE TYPE "MysteryStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "RatingStatus" AS ENUM ('DRAFT', 'READY', 'PUBLISHED');

-- CreateTable
CREATE TABLE "daily_task_templates" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" "DailyTaskCategory" NOT NULL,
    "position" "EmployeePosition",
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "defaultOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_task_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_tasks" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "templateId" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" "DailyTaskCategory" NOT NULL,
    "status" "DailyTaskStatus" NOT NULL DEFAULT 'TODO',
    "order" INTEGER NOT NULL DEFAULT 0,
    "source" "DailyTaskSource" NOT NULL DEFAULT 'SYSTEM',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "daily_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mystery_shopper_results" (
    "id" UUID NOT NULL,
    "employeeUserId" UUID NOT NULL,
    "periodMonth" INTEGER NOT NULL,
    "periodYear" INTEGER NOT NULL,
    "score" INTEGER NOT NULL,
    "comment" TEXT,
    "status" "MysteryStatus" NOT NULL DEFAULT 'DRAFT',
    "checkedAt" TIMESTAMP(3),
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "mystery_shopper_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monthly_sales_inputs" (
    "id" UUID NOT NULL,
    "employeeUserId" UUID NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "personalPlan" INTEGER NOT NULL,
    "personalFact" INTEGER NOT NULL,
    "salesScore" DOUBLE PRECISION,
    "enteredByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "monthly_sales_inputs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monthly_ratings" (
    "id" UUID NOT NULL,
    "employeeUserId" UUID NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "salesScore" DOUBLE PRECISION NOT NULL,
    "mysteryShopperScore" DOUBLE PRECISION NOT NULL,
    "finalScore" DOUBLE PRECISION NOT NULL,
    "rank" INTEGER NOT NULL,
    "previousRank" INTEGER,
    "status" "RatingStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "monthly_ratings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "achievement_definitions" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "achievement_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_achievements" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "achievementId" UUID NOT NULL,
    "awardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT,

    CONSTRAINT "user_achievements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "daily_task_templates_code_key" ON "daily_task_templates"("code");

-- CreateIndex
CREATE INDEX "daily_tasks_userId_date_idx" ON "daily_tasks"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "daily_tasks_userId_date_templateId_key" ON "daily_tasks"("userId", "date", "templateId");

-- CreateIndex
CREATE INDEX "mystery_shopper_results_employeeUserId_status_idx" ON "mystery_shopper_results"("employeeUserId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "mystery_shopper_results_employeeUserId_periodMonth_periodYe_key" ON "mystery_shopper_results"("employeeUserId", "periodMonth", "periodYear");

-- CreateIndex
CREATE INDEX "monthly_sales_inputs_year_month_idx" ON "monthly_sales_inputs"("year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "monthly_sales_inputs_employeeUserId_month_year_key" ON "monthly_sales_inputs"("employeeUserId", "month", "year");

-- CreateIndex
CREATE INDEX "monthly_ratings_status_year_month_idx" ON "monthly_ratings"("status", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "monthly_ratings_employeeUserId_month_year_key" ON "monthly_ratings"("employeeUserId", "month", "year");

-- CreateIndex
CREATE UNIQUE INDEX "achievement_definitions_code_key" ON "achievement_definitions"("code");

-- CreateIndex
CREATE INDEX "user_achievements_userId_idx" ON "user_achievements"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "user_achievements_userId_achievementId_key" ON "user_achievements"("userId", "achievementId");

-- AddForeignKey
ALTER TABLE "daily_tasks" ADD CONSTRAINT "daily_tasks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mystery_shopper_results" ADD CONSTRAINT "mystery_shopper_results_employeeUserId_fkey" FOREIGN KEY ("employeeUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_ratings" ADD CONSTRAINT "monthly_ratings_employeeUserId_fkey" FOREIGN KEY ("employeeUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_achievementId_fkey" FOREIGN KEY ("achievementId") REFERENCES "achievement_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

