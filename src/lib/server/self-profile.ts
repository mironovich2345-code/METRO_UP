import "server-only";
import { prisma } from "./db";
import type { CurrentUser } from "./session";
import type { SelfProfileUpdateData } from "@/lib/profile-edit";

/**
 * Sprint: LIVE QA QA-02 — data access for the employee's own Profile
 * (GET/PATCH /api/profile). Every function takes the SESSION user — there is
 * no way to name a different target user from here.
 */

/**
 * The open EmploymentAssignment's startedAt — the same "endedAt: null, most
 * recent first" lookup the manager Employee Card uses (rbac/employee-card.ts).
 * NEVER User.createdAt (an explicit earlier product decision): with no
 * assignment this is null and the Profile shows "Не указано". Nothing in the
 * codebase writes this table yet, so null is today's honest answer for every
 * employee.
 */
export async function loadOpenEmploymentStartedAt(userId: string): Promise<string | null> {
  const row = await prisma.employmentAssignment.findFirst({
    where: { userId, endedAt: null },
    orderBy: { startedAt: "desc" },
    select: { startedAt: true },
  });
  return row?.startedAt.toISOString() ?? null;
}

/**
 * Writes ONLY displayName for the session's own user — field by field, never
 * a spread of request data — plus an audit row when the name actually
 * changes, in one transaction (the same "every identity change is audited"
 * convention onboarding follows). Returns the user in the CurrentUser shape
 * meDTO expects.
 */
export async function updateOwnDisplayName(user: CurrentUser, data: SelfProfileUpdateData) {
  return prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id: user.id },
      data: { displayName: data.displayName },
      include: { employeeProfile: true },
    });
    if (user.displayName !== data.displayName) {
      await tx.userAuditLog.create({
        data: {
          actorUserId: user.id,
          targetUserId: user.id,
          action: "PROFILE_NAME_UPDATED",
          before: { displayName: user.displayName },
          after: { displayName: data.displayName },
        },
      });
    }
    return updated;
  });
}
