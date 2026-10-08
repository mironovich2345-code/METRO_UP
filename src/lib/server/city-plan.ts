import "server-only";
import { prisma } from "./db";
import { AuthError } from "./authz";
import { appDay } from "./time";
import { getClubById } from "@/content/cities";
import type { CurrentUser } from "./session";
import { getActorContext, cityIdForClub } from "./rbac/context";
import { authorize } from "./rbac/authorize-core";
import { hasActiveRole } from "./rbac/scope-core";
import type { AssignCityManagerTaskResultDTO, ClubManagerTaskStatusDTO } from "@/lib/api/cabinet-types";

/**
 * Management Round E2 — CITY_MANAGER -> CLUB_MANAGER Daily Plan delegation.
 * A dedicated, parallel service to club-plan.ts's own createManagerTask —
 * deliberately NOT a role branch bolted onto that function (section 7's
 * explicit instruction). Reuses the EXISTING DailyTask domain unchanged: a
 * delegated task is nothing more than a direct DailyTask insert with no
 * template id — the exact same "one-off manager task" shape
 * createManagerTask already produces for a CLUB_MANAGER assigning to their
 * own employees, just authorized and sourced differently. The existing
 * read path (getPlanToday, GET /api/plan/today) has no filter on
 * source/createdByUserId/template id at all, so it picks up a delegated
 * task automatically — no second read API, no parallel plan model.
 */

export interface AssignCityManagerTaskInput {
  clubId: string;
  /** YYYY-MM-DD, already regex-validated by the route's Zod schema. */
  date: string;
  title: string;
}

/**
 * Section 9's audit — resolves the ONE active CLUB_MANAGER for a club from
 * EITHER identity source the rest of this cabinet already treats as
 * equally valid: an ACTIVE CLUB_MANAGER RoleAssignment grant for this exact
 * club (checked first — the newer, authoritative system), or the legacy
 * AppRole=CLUB_MANAGER + EmployeeProfile.clubId convention
 * (resolveClubManagerClubs' own union, resolveClubManagerCabinetAccess's
 * own tier 2 — the exact two places this engagement already fixed for the
 * SAME "legacy manager treated as second-class" bug class). Returns null
 * when neither source has an active manager for this club — "no manager
 * assigned", never a guess, never an arbitrary pick among several.
 */
export async function resolveActiveClubManagerForClub(clubId: string): Promise<{ userId: string; displayName: string } | null> {
  const grant = await prisma.roleAssignment.findFirst({
    where: { role: "CLUB_MANAGER", status: "ACTIVE", clubId },
    select: { userId: true },
  });
  if (grant) {
    const user = await prisma.user.findUnique({ where: { id: grant.userId }, select: { displayName: true } });
    if (user) return { userId: grant.userId, displayName: user.displayName };
  }
  const legacy = await prisma.user.findFirst({
    where: { role: "CLUB_MANAGER", employeeProfile: { clubId } },
    select: { id: true, displayName: true },
  });
  return legacy ? { userId: legacy.id, displayName: legacy.displayName } : null;
}

/**
 * Section 7 — every validation the brief lists, in order:
 * 1. caller is a real, ACTIVE CITY_MANAGER (hasActiveRole — revoked/
 *    suspended grants never count, re-derived fresh every call, same as
 *    every other RBAC decision in this codebase).
 * 2/3. the target club is inside the CALLER's own effective scope
 *    (authorize's existing club.read predicate — a CITY-scope grant
 *    covering the club's city, or a CLUB-scope point exception for this
 *    exact club; a foreign club independently re-derives the club's real
 *    cityId and never trusts a client-supplied one).
 * 4. requested date is today or in the future (section 2) — business
 *    timezone via appDay(), never UTC drift.
 * 5. text is non-empty, bounded.
 * 6/7/8. createdByUserId/targetUserId/source are ALWAYS server-derived —
 *    the input type above has no room for any of the three; a client can
 *    submit nothing but clubId/date/title.
 */
export async function createCityManagerTaskForClubManager(
  actor: CurrentUser,
  input: AssignCityManagerTaskInput,
): Promise<AssignCityManagerTaskResultDTO> {
  const cityActor = await getActorContext(actor);
  if (!hasActiveRole(cityActor.grants, "CITY_MANAGER")) {
    throw new AuthError(403, "forbidden", "Доступно только Ст. города");
  }

  const title = input.title.trim();
  if (!title) throw new AuthError(400, "empty_task", "Текст задачи не может быть пустым");

  const date = new Date(`${input.date}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw new AuthError(400, "invalid_date", "Некорректная дата");
  if (date.getTime() < appDay().getTime()) {
    throw new AuthError(400, "past_date", "Нельзя назначить задачу на прошедшую дату");
  }

  const targetClubCityId = await cityIdForClub(input.clubId);
  if (!targetClubCityId) throw new AuthError(404, "club_not_found", "Клуб не найден");
  if (!authorize(cityActor, { action: "club.read", targetClubId: input.clubId, targetClubCityId })) {
    throw new AuthError(403, "forbidden", "Клуб не входит в вашу зону ответственности");
  }

  const manager = await resolveActiveClubManagerForClub(input.clubId);
  if (!manager) throw new AuthError(404, "no_manager", "В этом клубе нет назначенного управляющего");

  // Round E0's audit finding, reused here unmodified: DailyTaskSource.MANAGER
  // already means "a manager created this" (currently: a CLUB_MANAGER's own
  // one-off/club-template tasks) with no tier distinction baked into the
  // enum value itself — createdByUserId is what actually records WHO. A
  // CITY_MANAGER assigning a task is still, semantically, "a manager
  // created this" — reused as-is rather than inventing a new enum value,
  // per section 1's own "if semantically correct, reuse" instruction.
  const created = await prisma.dailyTask.create({
    data: {
      userId: manager.userId,
      date,
      title,
      category: "MANAGER",
      required: false,
      priority: "NORMAL",
      order: 200,
      source: "MANAGER",
      createdByUserId: actor.id,
    },
    select: { id: true },
  });

  // Section 12 — safe metadata only: opaque ids + the task date, never the
  // task's own text (not required for the audit trail, and this is a
  // one-off instruction a manager wrote, not a sensitive HR record, but
  // the brief is explicit: "do not include ... task text if not required").
  await prisma.userAuditLog.create({
    data: {
      actorUserId: actor.id,
      targetUserId: manager.userId,
      action: "DAILY_TASK_ASSIGNED",
      clubId: input.clubId,
      metadata: { taskId: created.id, date: input.date },
    },
  });

  return {
    taskId: created.id,
    assignedToUserId: manager.userId,
    assignedToName: manager.displayName,
    clubName: getClubById(input.clubId)?.name ?? null,
    date: input.date,
  };
}

/**
 * Section 11 — the smallest scoped read service: NOT getPlanTodayFor (that
 * materializes SYSTEM/club-template tasks and pulls in Academy/sales
 * context — real side effects and real extra work no management summary
 * needs), just a plain count of the target manager's OWN "today" DailyTask
 * rows. Returns null when the club has no active manager to report on —
 * the caller (the route) uses this to decide whether to show "Поставить
 * задачу"/"Задачи" at all, independent of the pre-existing, grant-only
 * `currentManager` /city/club's own "Управляющий" card already uses for
 * its unrelated assign/revoke actions (which genuinely must stay
 * grant-only — "Снять" operates on a RoleAssignment id a legacy manager
 * does not have).
 */
export async function getClubManagerTaskStatus(clubId: string): Promise<ClubManagerTaskStatusDTO | null> {
  const manager = await resolveActiveClubManagerForClub(clubId);
  if (!manager) return null;
  const tasks = await prisma.dailyTask.findMany({ where: { userId: manager.userId, date: appDay() }, select: { status: true } });
  return {
    manager,
    today: { total: tasks.length, completed: tasks.filter((t) => t.status === "COMPLETED").length },
  };
}
