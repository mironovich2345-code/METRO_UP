-- CreateTable
CREATE TABLE "employment_assignments" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "clubId" TEXT NOT NULL,
    "positionId" "EmployeePosition" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "changedByUserId" UUID,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employment_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "employment_assignments_userId_endedAt_idx" ON "employment_assignments"("userId", "endedAt");

-- CreateIndex
CREATE INDEX "employment_assignments_clubId_idx" ON "employment_assignments"("clubId");

-- AddForeignKey
ALTER TABLE "employment_assignments" ADD CONSTRAINT "employment_assignments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employment_assignments" ADD CONSTRAINT "employment_assignments_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "clubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
