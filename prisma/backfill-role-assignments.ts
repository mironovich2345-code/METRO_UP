import { PrismaClient } from "@prisma/client";

/**
 * ADDITIVE, idempotent backfill of RoleAssignment from the legacy AppRole
 * axis. Not wired to `prisma db seed` — run manually:
 *
 *   npx tsx prisma/backfill-role-assignments.ts --dry-run   (preview only)
 *   npx tsx prisma/backfill-role-assignments.ts             (writes)
 *
 * Migration strategy (see Sprint 1 RBAC plan, "Migration strategy"):
 * - AppRole=ADMIN            -> RoleAssignment{PROJECT_ADMIN, SYSTEM, ACTIVE}
 * - AppRole=CLUB_MANAGER
 *   + EmployeeProfile.clubId -> RoleAssignment{CLUB_MANAGER, CLUB, ACTIVE}
 * - AppRole=CLUB_MANAGER
 *   without a clubId         -> NOT migrated; reported as an anomaly, never
 *                                guessed at (a CLUB_MANAGER without a club
 *                                should not exist per user-admin-logic.ts's
 *                                managerMissingClub() guard, but this script
 *                                does not assume that guard was always in
 *                                effect for historical data).
 * - AppRole=SPM, EMPLOYEE    -> intentionally NOT migrated in Phase 2A. SPM
 *   stays a legacy-only axis; ordinary employees are not bulk-converted into
 *   MANAGER RoleAssignment rows (that would manufacture a PENDING_APPROVAL
 *   queue for people who are already working normally today — a business
 *   decision this script does not make on anyone's behalf, see Sprint 1
 *   plan's open questions).
 *
 * Idempotent: re-running never creates a duplicate — each user/scope is
 * checked for an existing ACTIVE row before any write (the partial unique
 * index added in the RoleAssignment migration is the DB-level backstop, not
 * the primary mechanism here — this script never intentionally races itself).
 */

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes("--dry-run");

interface Anomaly {
  userId: string;
  displayName: string;
  reason: string;
}

interface Summary {
  projectAdminCreated: number;
  projectAdminSkipped: number;
  clubManagerCreated: number;
  clubManagerSkipped: number;
  clubManagerAnomalies: Anomaly[];
}

async function backfillProjectAdmins(summary: Summary): Promise<void> {
  const admins = await prisma.user.findMany({ where: { role: "ADMIN" } });
  for (const admin of admins) {
    const existing = await prisma.roleAssignment.findFirst({
      where: { userId: admin.id, role: "PROJECT_ADMIN", scopeType: "SYSTEM", status: "ACTIVE" },
      select: { id: true },
    });
    if (existing) {
      summary.projectAdminSkipped += 1;
      continue;
    }
    if (!DRY_RUN) {
      await prisma.roleAssignment.create({
        data: {
          userId: admin.id,
          role: "PROJECT_ADMIN",
          scopeType: "SYSTEM",
          status: "ACTIVE",
          assignedByUserId: null, // system bootstrap, not assigned by a person
          reason: "legacy-backfill: AppRole=ADMIN",
        },
      });
    }
    summary.projectAdminCreated += 1;
  }
}

async function backfillClubManagers(summary: Summary): Promise<void> {
  const managers = await prisma.user.findMany({
    where: { role: "CLUB_MANAGER" },
    include: { employeeProfile: true },
  });
  for (const manager of managers) {
    const clubId = manager.employeeProfile?.clubId ?? null;
    if (!clubId) {
      summary.clubManagerAnomalies.push({
        userId: manager.id,
        displayName: manager.displayName,
        reason: "AppRole=CLUB_MANAGER but no EmployeeProfile.clubId — not migrated, needs manual review",
      });
      continue;
    }
    const existing = await prisma.roleAssignment.findFirst({
      where: { userId: manager.id, role: "CLUB_MANAGER", scopeType: "CLUB", clubId, status: "ACTIVE" },
      select: { id: true },
    });
    if (existing) {
      summary.clubManagerSkipped += 1;
      continue;
    }
    if (!DRY_RUN) {
      await prisma.roleAssignment.create({
        data: {
          userId: manager.id,
          role: "CLUB_MANAGER",
          scopeType: "CLUB",
          clubId,
          status: "ACTIVE",
          assignedByUserId: null,
          reason: "legacy-backfill: AppRole=CLUB_MANAGER",
        },
      });
    }
    summary.clubManagerCreated += 1;
  }
}

async function main(): Promise<void> {
  console.log(`RoleAssignment backfill — ${DRY_RUN ? "DRY RUN (no writes)" : "LIVE"}`);

  const summary: Summary = {
    projectAdminCreated: 0,
    projectAdminSkipped: 0,
    clubManagerCreated: 0,
    clubManagerSkipped: 0,
    clubManagerAnomalies: [],
  };

  await backfillProjectAdmins(summary);
  await backfillClubManagers(summary);

  console.log("\n--- Summary ---");
  console.log(
    `PROJECT_ADMIN: ${summary.projectAdminCreated} ${DRY_RUN ? "would be created" : "created"}, ${summary.projectAdminSkipped} already present`,
  );
  console.log(
    `CLUB_MANAGER:  ${summary.clubManagerCreated} ${DRY_RUN ? "would be created" : "created"}, ${summary.clubManagerSkipped} already present`,
  );
  if (summary.clubManagerAnomalies.length > 0) {
    console.log(`\n⚠ ${summary.clubManagerAnomalies.length} CLUB_MANAGER anomaly(-ies) — NOT migrated:`);
    for (const a of summary.clubManagerAnomalies) {
      console.log(`  - ${a.displayName} (${a.userId}): ${a.reason}`);
    }
  }
  console.log("\nNot touched by design: AppRole=SPM, AppRole=EMPLOYEE (see file header).");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error("RoleAssignment backfill failed:", e instanceof Error ? e.message : e);
    await prisma.$disconnect();
    process.exit(1);
  });
