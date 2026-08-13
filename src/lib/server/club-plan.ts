import "server-only";
import type { EmployeePosition } from "@prisma/client";
import { prisma } from "./db";
import { AuthError } from "./authz";
import { appDay } from "./time";
import { materializeDailyPlan } from "./daily-plan";
import type { CurrentUser } from "./session";
import { getPositionById } from "@/content/positions";
import { getClubById } from "@/content/cities";
import type {
  ClubPlanDTO,
  ClubPlanEmployeeDTO,
  ClubTaskTarget,
  ClubTaskTemplateDTO,
  ClubTeamDTO,
} from "@/lib/api/club-plan-types";

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

function requireClubId(user: CurrentUser): string {
  const { clubId } = resolveClubContext(user);
  if (!clubId) throw new AuthError(409, "no_club", "Ваша учётная запись не привязана к клубу");
  return clubId;
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
    defaultOrder: t.defaultOrder,
    isActive: t.isActive,
  }));
}

export async function createClubTemplate(
  actor: CurrentUser,
  input: { title: string; description?: string | null; targetPosition?: EmployeePosition | null; required?: boolean; defaultOrder?: number },
) {
  const clubId = requireClubId(actor);
  const max = await prisma.clubTaskTemplate.aggregate({ where: { clubId }, _max: { defaultOrder: true } });
  return prisma.clubTaskTemplate.create({
    data: {
      clubId,
      title: input.title,
      description: input.description ?? null,
      targetPosition: input.targetPosition ?? null,
      required: input.required ?? false,
      defaultOrder: input.defaultOrder ?? (max._max.defaultOrder ?? 0) + 1,
      createdByUserId: actor.id,
    },
  });
}

async function assertOwnTemplate(actor: CurrentUser, id: string): Promise<string> {
  const clubId = requireClubId(actor);
  const t = await prisma.clubTaskTemplate.findUnique({ where: { id }, select: { clubId: true } });
  if (!t) throw new AuthError(404, "template_not_found");
  if (t.clubId !== clubId) throw new AuthError(403, "not_your_club", "Шаблон другого клуба");
  return clubId;
}

export async function updateClubTemplate(
  actor: CurrentUser,
  id: string,
  input: { title?: string; description?: string | null; targetPosition?: EmployeePosition | null; required?: boolean; isActive?: boolean; defaultOrder?: number },
) {
  await assertOwnTemplate(actor, id);
  return prisma.clubTaskTemplate.update({
    where: { id },
    data: {
      title: input.title,
      description: input.description === undefined ? undefined : input.description,
      targetPosition: input.targetPosition === undefined ? undefined : input.targetPosition,
      required: input.required,
      isActive: input.isActive,
      defaultOrder: input.defaultOrder,
    },
  });
}

export async function reorderClubTemplates(actor: CurrentUser, ids: string[]) {
  const clubId = requireClubId(actor);
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
  input: { title: string; description?: string | null; date: string; required?: boolean; target: ClubTaskTarget },
) {
  const clubId = requireClubId(actor);
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
  await prisma.dailyTask.createMany({
    data: userIds.map((uid) => ({
      userId: uid,
      date,
      title: input.title,
      description: input.description ?? null,
      category: "MANAGER" as const,
      required: input.required ?? false,
      order: 200,
      source: "MANAGER" as const,
      createdByUserId: actor.id,
    })),
  });
  return { count: userIds.length };
}

export async function deleteManagerTask(actor: CurrentUser, taskId: string) {
  const clubId = requireClubId(actor);
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

const EMPTY_PLAN = (date: string): ClubPlanDTO => ({
  date, clubId: null, clubName: null, totalEmployees: 0, employeesCompleted: 0,
  tasksTotal: 0, tasksCompleted: 0, employees: [], templates: [],
});

export async function getClubPlan(user: CurrentUser, dateStr?: string): Promise<ClubPlanDTO> {
  const date = dateStr ? new Date(`${dateStr}T00:00:00.000Z`) : appDay();
  const iso = date.toISOString().slice(0, 10);
  const { clubId, clubName } = resolveClubContext(user);
  if (!clubId) return EMPTY_PLAN(iso);

  const employees = await getClubEmployees(clubId);
  // Materialize each employee's plan (system + club templates) so counts are real.
  await Promise.all(
    employees.map((e) =>
      materializeDailyPlan({ userId: e.id, position: e.employeeProfile?.positionId ?? null, clubId }, date),
    ),
  );

  const tasks = await prisma.dailyTask.findMany({
    where: { userId: { in: employees.map((e) => e.id) }, date },
    orderBy: { order: "asc" },
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
      tasks: t.map((x) => ({
        id: x.id,
        title: x.title,
        description: x.description,
        status: x.status,
        required: x.required,
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
  };
}

export async function getClubTeam(user: CurrentUser): Promise<ClubTeamDTO> {
  const { clubId, clubName } = resolveClubContext(user);
  if (!clubId) return { clubId: null, clubName: null, members: [] };

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
    })),
  };
}
