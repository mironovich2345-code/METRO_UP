
-- CreateTable
CREATE TABLE "script_categories" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "script_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scripts" (
    "id" UUID NOT NULL,
    "categoryId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "content" JSONB NOT NULL,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdByUserId" UUID NOT NULL,
    "updatedByUserId" UUID,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scripts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_instruction_categories" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_instruction_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_instructions" (
    "id" UUID NOT NULL,
    "categoryId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "summary" TEXT,
    "blocks" JSONB NOT NULL,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdByUserId" UUID NOT NULL,
    "updatedByUserId" UUID,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_instructions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_audit_logs" (
    "id" UUID NOT NULL,
    "actorUserId" UUID NOT NULL,
    "targetUserId" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "script_categories_slug_key" ON "script_categories"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "scripts_slug_key" ON "scripts"("slug");

-- CreateIndex
CREATE INDEX "scripts_categoryId_status_idx" ON "scripts"("categoryId", "status");

-- CreateIndex
CREATE INDEX "scripts_status_idx" ON "scripts"("status");

-- CreateIndex
CREATE UNIQUE INDEX "work_instruction_categories_slug_key" ON "work_instruction_categories"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "work_instructions_slug_key" ON "work_instructions"("slug");

-- CreateIndex
CREATE INDEX "work_instructions_categoryId_status_idx" ON "work_instructions"("categoryId", "status");

-- CreateIndex
CREATE INDEX "work_instructions_status_idx" ON "work_instructions"("status");

-- CreateIndex
CREATE INDEX "user_audit_logs_targetUserId_idx" ON "user_audit_logs"("targetUserId");

-- CreateIndex
CREATE INDEX "user_audit_logs_actorUserId_idx" ON "user_audit_logs"("actorUserId");

-- AddForeignKey
ALTER TABLE "scripts" ADD CONSTRAINT "scripts_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "script_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_instructions" ADD CONSTRAINT "work_instructions_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "work_instruction_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

