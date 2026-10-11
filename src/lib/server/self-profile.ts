import "server-only";
import { prisma } from "./db";
import type { CurrentUser } from "./session";
import type { SelfProfileUpdateData } from "@/lib/profile-edit";
import { AuthError } from "./authz";
import { EMPLOYMENT_DATE_MESSAGES, planEmploymentStartChange } from "@/lib/employment-date";

/**
 * Sprint: LIVE QA QA-02 — data access for the employee's own Profile
 * (GET/PATCH /api/profile). Every function takes the SESSION user — there is
 * no way to name a different target user from here.
 */

/**
 * The open EmploymentAssignment's startedAt — the same "endedAt: null, most
 * recent first" lookup the manager Employee Card uses (rbac/employee-card.ts).
 * NEVER User.createdAt (an explicit earlier product decision): with no
 * assignment this is null and the Profile shows "Не указано". Written only by
 * updateOwnEmploymentStartDate below (QA-04).
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

/**
 * Sprint: LIVE QA QA-04, section A — the employee sets THEIR OWN current
 * employment start date. Target is always the session user.
 *
 * Which row is "current employment": the open EmploymentAssignment
 * (endedAt = null; the most recent by startedAt if, abnormally, several are
 * open) — the exact row the Profile and the manager Employee Card already
 * read. Closed rows (endedAt set) are transfer history and are NEVER
 * modified here.
 *
 * - An open row exists -> only its startedAt changes (by id). Club, position,
 *   endedAt, reason and changedByUserId stay as recorded.
 * - No open row -> one is created from the employee's REAL current corporate
 *   data (EmployeeProfile.clubId / positionId — the same two fields this
 *   table records), with the chosen date. Nothing else is invented.
 * - The new date may not precede the end of the previous (closed)
 *   assignment, so the timeline never overlaps.
 *
 * Every change is audited (PROFILE_EMPLOYMENT_START_UPDATED) in the same
 * transaction. An unchanged date writes nothing.
 */
export async function updateOwnEmploymentStartDate(
  user: CurrentUser,
  input: { isoDate: string; date: Date },
): Promise<string> {
  const profile = user.employeeProfile;
  if (!profile) throw new AuthError(409, "onboarding_required", "Employee profile required");

  return prisma.$transaction(async (tx) => {
    const [open, previous] = await Promise.all([
      tx.employmentAssignment.findFirst({
        where: { userId: user.id, endedAt: null },
        orderBy: { startedAt: "desc" },
        select: { id: true, startedAt: true },
      }),
      tx.employmentAssignment.findFirst({
        where: { userId: user.id, endedAt: { not: null } },
        orderBy: { endedAt: "desc" },
        select: { endedAt: true },
      }),
    ]);

    const plan = planEmploymentStartChange({
      isoDate: input.isoDate,
      date: input.date,
      open,
      previousEndedAt: previous?.endedAt ?? null,
      profile: { clubId: profile.clubId, positionId: profile.positionId },
    });
    if (plan.kind === "reject") {
      throw new AuthError(400, plan.code, EMPLOYMENT_DATE_MESSAGES[plan.code]);
    }
    if (plan.kind === "noop") return plan.startedAt.toISOString();

    const saved =
      plan.kind === "update"
        ? await tx.employmentAssignment.update({
            where: { id: plan.assignmentId },
            data: { startedAt: input.date },
            select: { id: true, startedAt: true, clubId: true },
          })
        : await tx.employmentAssignment.create({
            data: {
              userId: user.id,
              clubId: plan.clubId,
              positionId: plan.positionId,
              startedAt: input.date,
              changedByUserId: user.id,
              reason: "self_reported_start_date",
            },
            select: { id: true, startedAt: true, clubId: true },
          });

    await tx.userAuditLog.create({
      data: {
        actorUserId: user.id,
        targetUserId: user.id,
        action: "PROFILE_EMPLOYMENT_START_UPDATED",
        clubId: saved.clubId,
        before: { startedAt: open?.startedAt.toISOString() ?? null },
        after: { startedAt: saved.startedAt.toISOString() },
        metadata: { employmentAssignmentId: saved.id, created: !open },
      },
    });

    return saved.startedAt.toISOString();
  });
}
