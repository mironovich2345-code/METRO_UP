import "server-only";
import type { AccessStatus, DailyTaskPriority, EmployeePosition } from "@prisma/client";
import { prisma } from "./db";
import { AuthError } from "./authz";
import { appDay } from "./time";
import { materializeDailyPlan } from "./daily-plan";
import { templatesForPosition } from "./daily-plan-catalog";
import { normalizeChecklist, type ChecklistInput } from "./club-plan-schemas";
import type { CurrentUser } from "./session";
import { canSwitchClub, requestedClubForRole } from "@/lib/club-scope";
import { getPositionById } from "@/content/positions";
import { getClubById } from "@/content/cities";
import type {
  ChecklistItemDefDTO,
  ClubPlanDTO,
  ClubPlanEmployeeDTO,
  ClubTaskTarget,
  ClubTaskTemplateDTO,
  ClubTeamDTO,
  ManagerScopeDTO,
} from "@/lib/api/club-plan-types";

/** Read a template's stored checklist JSON into typed items (definition only). */
function readTemplateChecklist(json: unknown): ChecklistItemDefDTO[] {
  if (!Array.isArray(json)) return [];
  return json
    .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
    .filter((x) => typeof x.id === "string" && typeof x.text === "string")
    .map((x) => ({ id: x.id as string, text: x.text as string, required: x.required !== false, order: typeof x.order === "number" ? x.order : 0 }))
    .sort((a, b) => a.order - b.order);
}

/**
 * CLUB_MANAGER daily-plan control. Every operation is scoped to the actor's OWN
 * club — the clubId is ALWAYS derived from the server session's EmployeeProfile,
 * never accepted from the client. System tasks are never editable by a manager.
 */

/** The acting manager's club, derived from the session (never the client). */
export function resolveClubContext(user: CurrentUser): { clubId: string | null; clubName: string | null } {
  const clubId = user.employeeProfile?.clubId ?? null;
  return { clubId, clubName: clubId ? getClubById(clubId)?.name ?? null : null };
}

/**
 * Club-scope resolution. Authorization stays server-side:
 * - CLUB_MANAGER is ALWAYS locked to their own EmployeeProfile.clubId — a
 *   requested clubId from the client is ignored entirely (never trusted).
 * - ADMIN (superuser) may operate on any real active club: a requested clubId is
 *   validated against the DB; otherwise their own club (if any) is the default.
 * There is no client-only authorization — every switch is validated here.
 */
async function resolveScopedClubId(user: CurrentUser, requestedClubId?: string | null): Promise<string> {
  const honored = requestedClubForRole(user.role, requestedClubId); // manager → null
  if (honored) {
    const club = await prisma.club.findFirst({ where: { id: honored, isActive: true }, select: { id: true } });
    if (!club) throw new AuthError(400, "invalid_club", "Клуб не найден");
    return club.id;
  }
  const own = user.employeeProfile?.clubId ?? null;
  if (!own) {
    // ADMIN without a club must pick one; a real manager simply has no club.
    const isAdmin = canSwitchClub(user.role);
    throw new AuthError(409, isAdmin ? "select_club" : "no_club", isAdmin ? "Выберите клуб" : "Ваша учётная запись не привязана к клубу");
  }
  return own;
}

/** Clubs an ADMIN may scope into (server-backed selector source). */
async function listActiveClubs(): Promise<ManagerScopeDTO["clubs"]> {
  const clubs = await prisma.club.findMany({
    where: { isActive: true },
    orderBy: [{ name: "asc" }],
    include: { city: { select: { name: true } } },
  });
  return clubs.map((c) => ({ id: c.id, name: c.name, cityName: c.city?.name ?? null }));
}

/**
 * Non-throwing scope for READ views. For ADMIN returns the switchable club list;
 * an invalid requested club falls back to their own club (reads never error).
 * For CLUB_MANAGER always returns their own club and an empty selector.
 */
export async function getManagerScope(user: CurrentUser, requestedClubId?: string | null): Promise<ManagerScopeDTO> {
  const isAdmin = canSwitchClub(user.role);
  const honored = requestedClubForRole(user.role, requestedClubId); // manager → null
  let clubId: string | null;
  if (honored) {
    const club = await prisma.club.findFirst({ where: { id: honored, isActive: true }, select: { id: true } });
    clubId = club ? club.id : user.employeeProfile?.clubId ?? null;
  } else {
    clubId = user.employeeProfile?.clubId ?? null;
  }
  return {
    clubId,
    clubName: clubId ? getClubById(clubId)?.name ?? null : null,
    canSwitch: isAdmin,
    clubs: isAdmin ? await listActiveClubs() : [],
  };
}

async function getClubEmployees(clubId: string) {
  return prisma.user.findMany({
    where: { role: "EMPLOYEE", employeeProfile: { clubId } },
    include: { employeeProfile: true },
    orderBy: { displayName: "asc" },
  });
}

/* ------------------------------- templates ------------------------------- */

export async function getClubTemplates(clubId: string): Promise<ClubTaskTemplateDTO[]> {
  const rows = await prisma.clubTaskTemplate.findMany({
    where: { clubId },
    orderBy: [{ defaultOrder: "asc" }, { createdAt: "asc" }],
  });
  return rows.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    targetPosition: t.targetPosition,
    required: t.required,
    priority: t.priority,
    timeHint: t.timeHint,
    checklist: readTemplateChecklist(t.checklist),
    defaultOrder: t.defaultOrder,
    isActive: t.isActive,
    isDefault: t.code != null,
  }));
}

interface TemplateInput {
  title: string;
  description?: string | null;
  targetPosition?: EmployeePosition | null;
  required?: boolean;
  priority?: DailyTaskPriority;
  timeHint?: string | null;
  checklist?: ChecklistInput;
  defaultOrder?: number;
}

export async function createClubTemplate(actor: CurrentUser, input: TemplateInput, scopeClubId?: string | null) {
  const clubId = await resolveScopedClubId(actor, scopeClubId);
  const max = await prisma.clubTaskTemplate.aggregate({ where: { clubId }, _max: { defaultOrder: true } });
  return prisma.clubTaskTemplate.create({
    data: {
      clubId,
      title: input.title,
      description: input.description ?? null,
      targetPosition: input.targetPosition ?? null,
      required: input.required ?? false,
      priority: input.priority ?? "NORMAL",
      timeHint: input.timeHint ?? null,
      checklist: normalizeChecklist(input.checklist) as object,
      defaultOrder: input.defaultOrder ?? (max._max.defaultOrder ?? 0) + 1,
      createdByUserId: actor.id,
    },
  });
}

async function assertOwnTemplate(actor: CurrentUser, id: string, scopeClubId?: string | null): Promise<string> {
  const clubId = await resolveScopedClubId(actor, scopeClubId);
  const t = await prisma.clubTaskTemplate.findUnique({ where: { id }, select: { clubId: true } });
  if (!t) throw new AuthError(404, "template_not_found");
  if (t.clubId !== clubId) throw new AuthError(403, "not_your_club", "Шаблон другого клуба");
  return clubId;
}

export async function updateClubTemplate(
  actor: CurrentUser,
  id: string,
  input: Partial<TemplateInput> & { isActive?: boolean },
  scopeClubId?: string | null,
) {
  await assertOwnTemplate(actor, id, scopeClubId);
  return prisma.clubTaskTemplate.update({
    where: { id },
    data: {
      title: input.title,
      description: input.description === undefined ? undefined : input.description,
      targetPosition: input.targetPosition === undefined ? undefined : input.targetPosition,
      required: input.required,
      priority: input.priority,
      timeHint: input.timeHint === undefined ? undefined : input.timeHint,
      checklist: input.checklist === undefined ? undefined : (normalizeChecklist(input.checklist) as object),
      isActive: input.isActive,
      defaultOrder: input.defaultOrder,
    },
  });
}

export async function reorderClubTemplates(actor: CurrentUser, ids: string[], scopeClubId?: string | null) {
  const clubId = await resolveScopedClubId(actor, scopeClubId);
  const owned = await prisma.clubTaskTemplate.findMany({ where: { id: { in: ids }, clubId }, select: { id: true } });
  const ownedSet = new Set(owned.map((o) => o.id));
  await prisma.$transaction(
    ids.filter((id) => ownedSet.has(id)).map((id, i) =>
      prisma.clubTaskTemplate.update({ where: { id }, data: { defaultOrder: i + 1 } }),
    ),
  );
}

/* ------------------------------ one-off tasks ---------------------------- */

export async function createManagerTask(
  actor: CurrentUser,
  input: {
    title: string;
    description?: string | null;
    date: string;
    required?: boolean;
    priority?: DailyTaskPriority;
    timeHint?: string | null;
    checklist?: ChecklistInput;
    target: ClubTaskTarget;
  },
  scopeClubId?: string | null,
) {
  const clubId = await resolveScopedClubId(actor, scopeClubId);
  const date = new Date(`${input.date}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw new AuthError(400, "invalid_date");

  let userIds: string[];
  if (input.target.type === "USER") {
    const emp = await prisma.user.findUnique({
      where: { id: input.target.userId },
      include: { employeeProfile: true },
    });
    // Cross-club protection: the assignee MUST belong to the actor's club.
    if (!emp || emp.role !== "EMPLOYEE" || emp.employeeProfile?.clubId !== clubId) {
      throw new AuthError(403, "employee_not_in_club", "Сотрудник не из вашего клуба");
    }
    userIds = [emp.id];
  } else if (input.target.type === "POSITION") {
    const emps = await prisma.user.findMany({
      where: { role: "EMPLOYEE", employeeProfile: { clubId, positionId: input.target.position } },
      select: { id: true },
    });
    userIds = emps.map((e) => e.id);
  } else {
    const emps = await prisma.user.findMany({
      where: { role: "EMPLOYEE", employeeProfile: { clubId, positionId: { in: ["CLIENT_MANAGER", "NIGHT_MANAGER"] } } },
      select: { id: true },
    });
    userIds = emps.map((e) => e.id);
  }

  if (userIds.length === 0) return { count: 0 };
  const checklist = normalizeChecklist(input.checklist);
  const created = await prisma.dailyTask.createManyAndReturn({
    data: userIds.map((uid) => ({
      userId: uid,
      date,
      title: input.title,
      description: input.description ?? null,
      category: "MANAGER" as const,
      required: input.required ?? false,
      priority: input.priority ?? "NORMAL",
      timeHint: input.timeHint ?? null,
      order: 200,
      source: "MANAGER" as const,
      createdByUserId: actor.id,
    })),
    select: { id: true },
  });
  if (checklist.length > 0) {
    await prisma.dailyTaskChecklistItem.createMany({
      data: created.flatMap((task) =>
        checklist.map((it) => ({ dailyTaskId: task.id, itemId: it.id, text: it.text, required: it.required, order: it.order })),
      ),
    });
  }
  return { count: userIds.length };
}

export async function deleteManagerTask(actor: CurrentUser, taskId: string, scopeClubId?: string | null) {
  const clubId = await resolveScopedClubId(actor, scopeClubId);
  const task = await prisma.dailyTask.findUnique({
    where: { id: taskId },
    include: { user: { include: { employeeProfile: true } } },
  });
  if (!task) throw new AuthError(404, "task_not_found");
  if (task.source !== "MANAGER" || task.clubTaskTemplateId != null) {
    throw new AuthError(403, "not_deletable", "Удалять можно только разовые задачи руководителя");
  }
  if (task.status === "COMPLETED") throw new AuthError(409, "already_completed", "Выполненную задачу удалить нельзя");
  if (task.user.employeeProfile?.clubId !== clubId) throw new AuthError(403, "not_your_club");
  await prisma.dailyTask.delete({ where: { id: taskId } });
}

/* --------------------------------- views --------------------------------- */

const EMPTY_PLAN = (date: string, scope: ManagerScopeDTO): ClubPlanDTO => ({
  date, clubId: scope.clubId, clubName: scope.clubName, totalEmployees: 0, employeesCompleted: 0,
  tasksTotal: 0, tasksCompleted: 0, employees: [], templates: [], systemTasks: [], scope,
});

/** Read-only SYSTEM tasks shown for context in the CLIENT_MANAGER standard plan. */
function clientManagerSystemTasks(): { title: string }[] {
  return templatesForPosition("CLIENT_MANAGER").map((t) => ({ title: t.title }));
}

export async function getClubPlan(user: CurrentUser, dateStr?: string, requestedClubId?: string | null): Promise<ClubPlanDTO> {
  const date = dateStr ? new Date(`${dateStr}T00:00:00.000Z`) : appDay();
  const iso = date.toISOString().slice(0, 10);
  const scope = await getManagerScope(user, requestedClubId);
  const { clubId, clubName } = scope;
  if (!clubId) return EMPTY_PLAN(iso, scope);

  const employees = await getClubEmployees(clubId);
  // Materialize each employee's plan (system + club templates) so counts are real.
  await Promise.all(
    employees.map((e) =>
      materializeDailyPlan({ userId: e.id, position: e.employeeProfile?.positionId ?? null, clubId }, date),
    ),
  );

  const tasks = await prisma.dailyTask.findMany({
    where: { userId: { in: employees.map((e) => e.id) }, date },
    orderBy: [{ priority: "desc" }, { order: "asc" }],
    include: { checklistItems: { orderBy: { order: "asc" } } },
  });
  const byUser = new Map<string, typeof tasks>();
  for (const t of tasks) {
    const arr = byUser.get(t.userId) ?? [];
    arr.push(t);
    byUser.set(t.userId, arr);
  }

  let tasksTotal = 0;
  let tasksCompleted = 0;
  let employeesCompleted = 0;
  const employeeDTOs: ClubPlanEmployeeDTO[] = employees.map((e) => {
    const t = byUser.get(e.id) ?? [];
    const completed = t.filter((x) => x.status === "COMPLETED").length;
    tasksTotal += t.length;
    tasksCompleted += completed;
    if (t.length > 0 && completed === t.length) employeesCompleted += 1;
    return {
      userId: e.id,
      displayName: e.displayName,
      positionTitle: e.employeeProfile ? getPositionById(e.employeeProfile.positionId)?.title ?? null : null,
      completed,
      total: t.length,
      hasHighUnfinished: t.some((x) => x.priority === "HIGH" && x.status !== "COMPLETED"),
      tasks: t.map((x) => ({
        id: x.id,
        title: x.title,
        description: x.description,
        status: x.status,
        required: x.required,
        priority: x.priority,
        timeHint: x.timeHint,
        checklist: x.checklistItems.map((c) => ({ id: c.itemId, text: c.text, required: c.required, done: c.done, order: c.order })),
        isManager: x.source === "MANAGER",
        canDelete: x.source === "MANAGER" && x.clubTaskTemplateId == null && x.status !== "COMPLETED",
      })),
    };
  });

  return {
    date: iso,
    clubId,
    clubName,
    totalEmployees: employees.length,
    employeesCompleted,
    tasksTotal,
    tasksCompleted,
    employees: employeeDTOs,
    templates: await getClubTemplates(clubId),
    systemTasks: clientManagerSystemTasks(),
    scope,
  };
}

export async function getClubTeam(user: CurrentUser, requestedClubId?: string | null): Promise<ClubTeamDTO> {
  const scope = await getManagerScope(user, requestedClubId);
  const { clubId, clubName } = scope;
  if (!clubId) return { clubId: null, clubName: null, members: [], scope };

  const employees = await getClubEmployees(clubId);
  const date = appDay();
  await Promise.all(
    employees.map((e) =>
      materializeDailyPlan({ userId: e.id, position: e.employeeProfile?.positionId ?? null, clubId }, date),
    ),
  );
  const ids = employees.map((e) => e.id);
  const [tasks, lessons] = await Promise.all([
    prisma.dailyTask.findMany({ where: { userId: { in: ids }, date }, select: { userId: true, status: true } }),
    prisma.lessonProgress.groupBy({ by: ["userId"], where: { userId: { in: ids }, status: "COMPLETED" }, _count: { _all: true } }),
  ]);
  const total = new Map<string, number>();
  const done = new Map<string, number>();
  for (const t of tasks) {
    total.set(t.userId, (total.get(t.userId) ?? 0) + 1);
    if (t.status === "COMPLETED") done.set(t.userId, (done.get(t.userId) ?? 0) + 1);
  }
  const lessonsByUser = new Map(lessons.map((l) => [l.userId, l._count._all]));

  return {
    clubId,
    clubName,
    members: employees.map((e) => ({
      userId: e.id,
      displayName: e.displayName,
      positionTitle: e.employeeProfile ? getPositionById(e.employeeProfile.positionId)?.title ?? null : null,
      planCompleted: done.get(e.id) ?? 0,
      planTotal: total.get(e.id) ?? 0,
      lessonsCompleted: lessonsByUser.get(e.id) ?? 0,
      onboardingCompleted: e.employeeProfile?.onboardingCompleted ?? false,
      accessStatus: (e.employeeProfile?.accessStatus ?? "LIMITED") as AccessStatus,
    })),
    scope,
  };
}

/**
 * Manager grant/revoke of an employee's full METRO UP access. Club-scoped exactly
 * like task assignment: the target MUST be a real EMPLOYEE of the actor's OWN club
 * (a CLUB_MANAGER can never touch another club; ADMIN operates on the club they
 * scoped into). The change is persisted on EmployeeProfile.accessStatus and audited.
 */
export async function setEmployeeAccess(
  actor: CurrentUser,
  targetUserId: string,
  accessStatus: AccessStatus,
  scopeClubId?: string | null,
): Promise<{ userId: string; accessStatus: AccessStatus }> {
  const clubId = await resolveScopedClubId(actor, scopeClubId);
  const target = await prisma.user.findUnique({ where: { id: targetUserId }, include: { employeeProfile: true } });
  // Cross-club protection: identical rule to createManagerTask's USER target.
  if (!target || target.role !== "EMPLOYEE" || target.employeeProfile?.clubId !== clubId) {
    throw new AuthError(403, "employee_not_in_club", "Сотрудник не из вашего клуба");
  }
  const before = target.employeeProfile?.accessStatus ?? null;
  await prisma.$transaction(async (tx) => {
    await tx.employeeProfile.update({ where: { userId: targetUserId }, data: { accessStatus } });
    await tx.userAuditLog.create({
      data: {
        actorUserId: actor.id,
        targetUserId,
        action: "ACCESS_GRANT",
        before: { accessStatus: before },
        after: { accessStatus },
      },
    });
  });
  return { userId: targetUserId, accessStatus };
}
