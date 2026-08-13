import "server-only";
import type { DailyTask, DailyTaskChecklistItem, EmployeePosition } from "@prisma/client";
import { prisma } from "./db";
import { AuthError } from "./authz";
import { appDay, appMonthYear } from "./time";
import { computeSalesScore } from "./rating-formula";
import { getAcademyState } from "./academy";
import { DAILY_TEMPLATES, taskMode, templatesForPosition } from "./daily-plan-catalog";
import { CLIENT_MANAGER_DEFAULTS } from "./club-plan-defaults";
import { isChecklistComplete } from "@/lib/checklist-logic";
import type { CurrentUser } from "./session";
import type { DailyPlanDTO, DailyTaskDTO } from "@/lib/api/home-types";

/**
 * Daily plan (v3). Tasks come from three sources shown to the employee as ONE
 * plan: SYSTEM templates, the club's STANDARD PLAN (recurring club templates),
 * and one-off manager tasks. Materialization is idempotent; a task with a
 * checklist is a per-day snapshot (checklist items + their completion belong to
 * the DailyTask, never the template), so editing a template never rewrites
 * history. Checklist tasks complete only when all required items are done.
 */

interface SnapshotChecklistItem { id: string; text: string; required: boolean; order: number }
function readChecklist(json: unknown): SnapshotChecklistItem[] {
  if (!Array.isArray(json)) return [];
  return json
    .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
    .filter((x) => typeof x.id === "string" && typeof x.text === "string")
    .map((x) => ({
      id: x.id as string,
      text: x.text as string,
      required: x.required !== false,
      order: typeof x.order === "number" ? x.order : 0,
    }));
}

/* --------------------------- template provisioning ----------------------- */

let templateIdCache: Map<string, string> | null = null;
const provisionedClubs = new Set<string>();

async function ensureTemplates(): Promise<Map<string, string>> {
  if (templateIdCache) return templateIdCache;
  const map = new Map<string, string>();
  for (const t of DAILY_TEMPLATES) {
    const row = await prisma.dailyTaskTemplate.upsert({
      where: { code: t.code },
      update: { title: t.title, description: t.description, category: t.category, position: t.position, defaultOrder: t.defaultOrder },
      create: { code: t.code, title: t.title, description: t.description, category: t.category, position: t.position, defaultOrder: t.defaultOrder },
    });
    map.set(t.code, row.id);
  }
  templateIdCache = map;
  return map;
}

/**
 * Idempotently provision the production-default CLIENT_MANAGER standard plan into
 * a club — but ONLY insert codes that are missing. It never updates existing
 * rows, so a manager's customizations (edits, disables) are preserved across
 * deploys. A process cache avoids re-checking within a running instance.
 */
export async function ensureClubDefaults(clubId: string): Promise<void> {
  if (provisionedClubs.has(clubId)) return;
  const codes = CLIENT_MANAGER_DEFAULTS.map((d) => d.code);
  const existing = await prisma.clubTaskTemplate.findMany({ where: { clubId, code: { in: codes } }, select: { code: true } });
  const have = new Set(existing.map((e) => e.code));
  const missing = CLIENT_MANAGER_DEFAULTS.filter((d) => !have.has(d.code));
  if (missing.length) {
    await prisma.clubTaskTemplate.createMany({
      data: missing.map((d) => ({
        clubId,
        code: d.code,
        title: d.title,
        description: d.description,
        targetPosition: d.targetPosition,
        required: d.required,
        priority: d.priority,
        timeHint: d.timeHint,
        checklist: d.checklist as object,
        defaultOrder: d.defaultOrder,
        createdByUserId: null, // provisioned default (no human author)
        isActive: true,
      })),
      skipDuplicates: true, // unique(clubId, code)
    });
  }
  provisionedClubs.add(clubId);
}

/* ----------------------------- materialization --------------------------- */

export interface PlanTarget {
  userId: string;
  position: EmployeePosition | null;
  clubId: string | null;
}

export async function materializeDailyPlan(target: PlanTarget, date: Date): Promise<void> {
  // SYSTEM templates (learning + sales).
  const templates = templatesForPosition(target.position);
  const ids = await ensureTemplates();
  await prisma.dailyTask.createMany({
    data: templates.map((t) => ({
      userId: target.userId,
      date,
      templateId: ids.get(t.code)!,
      title: t.title,
      description: t.description,
      category: t.category,
      order: t.defaultOrder,
      source: "SYSTEM" as const,
    })),
    skipDuplicates: true,
  });

  if (!target.clubId) return;
  await ensureClubDefaults(target.clubId);

  const clubTemplates = await prisma.clubTaskTemplate.findMany({
    where: {
      clubId: target.clubId,
      isActive: true,
      OR: [{ targetPosition: null }, { targetPosition: target.position ?? undefined }],
    },
  });
  if (clubTemplates.length === 0) return;

  await prisma.dailyTask.createMany({
    data: clubTemplates.map((t) => ({
      userId: target.userId,
      date,
      clubTaskTemplateId: t.id,
      title: t.title,
      description: t.description,
      category: "MANAGER" as const,
      required: t.required,
      priority: t.priority,
      timeHint: t.timeHint,
      order: 100 + t.defaultOrder,
      source: "MANAGER" as const,
      createdByUserId: t.createdByUserId,
    })),
    skipDuplicates: true, // unique(userId, date, clubTaskTemplateId)
  });

  // Snapshot each template's checklist onto the (possibly freshly created) task.
  const tasks = await prisma.dailyTask.findMany({
    where: { userId: target.userId, date, clubTaskTemplateId: { in: clubTemplates.map((t) => t.id) } },
    select: { id: true, clubTaskTemplateId: true },
  });
  const taskByTemplate = new Map(tasks.map((t) => [t.clubTaskTemplateId, t.id]));
  const items: { dailyTaskId: string; itemId: string; text: string; required: boolean; order: number }[] = [];
  for (const t of clubTemplates) {
    const taskId = taskByTemplate.get(t.id);
    if (!taskId) continue;
    for (const it of readChecklist(t.checklist)) {
      items.push({ dailyTaskId: taskId, itemId: it.id, text: it.text, required: it.required, order: it.order });
    }
  }
  if (items.length) {
    await prisma.dailyTaskChecklistItem.createMany({ data: items, skipDuplicates: true }); // unique(dailyTaskId, itemId)
  }
}

async function ensureTodayTasks(user: CurrentUser, date: Date): Promise<void> {
  await materializeDailyPlan(
    { userId: user.id, position: user.employeeProfile?.positionId ?? null, clubId: user.employeeProfile?.clubId ?? null },
    date,
  );
}

/* ------------------------------- completion ------------------------------ */

type TaskWithChecklist = DailyTask & { checklistItems: DailyTaskChecklistItem[] };

async function completedLessonToday(userId: string, dayStart: Date): Promise<boolean> {
  const n = await prisma.lessonProgress.count({ where: { userId, status: "COMPLETED", completedAt: { gte: dayStart } } });
  return n > 0;
}

function toDTO(task: DailyTask, actionSlug: string | null, checklistItems: DailyTaskChecklistItem[]): DailyTaskDTO {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    category: task.category,
    status: task.status,
    mode: taskMode(task.category),
    required: task.required,
    priority: task.priority,
    timeHint: task.timeHint,
    checklist: checklistItems
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((c) => ({ id: c.itemId, text: c.text, required: c.required, done: c.done, order: c.order })),
    order: task.order,
    actionSlug,
  };
}

export async function getPlanToday(user: CurrentUser): Promise<DailyPlanDTO> {
  const date = appDay();
  await ensureTodayTasks(user, date);

  const cur = appMonthYear();
  const [tasks, academy, learnedToday, salesNow] = await Promise.all([
    prisma.dailyTask.findMany({
      where: { userId: user.id, date },
      orderBy: [{ priority: "desc" }, { order: "asc" }],
      include: { checklistItems: { orderBy: { order: "asc" } } },
    }),
    getAcademyState(user.id),
    completedLessonToday(user.id, date),
    prisma.monthlySalesInput.findUnique({
      where: { employeeUserId_month_year: { employeeUserId: user.id, month: cur.month, year: cur.year } },
    }),
  ]);

  const nextSlug = academy.nextLesson?.slug ?? null;
  const learningDone = learnedToday || academy.nextLesson === null;

  const dtos: DailyTaskDTO[] = [];
  for (const task of tasks as TaskWithChecklist[]) {
    if (task.category === "SALES" && salesNow && salesNow.personalPlan > 0) {
      const score = computeSalesScore(salesNow.personalPlan, salesNow.personalFact);
      const dto = toDTO(task, null, task.checklistItems);
      dto.description = `План ${salesNow.personalPlan.toLocaleString("ru-RU")} ₽ · Факт ${salesNow.personalFact.toLocaleString("ru-RU")} ₽ · Выполнение ${score != null ? score.toFixed(1) : "—"}%`;
      dtos.push(dto);
    } else if (task.category === "LEARNING") {
      if (learningDone && task.status === "TODO") {
        await prisma.dailyTask.update({ where: { id: task.id }, data: { status: "COMPLETED", completedAt: new Date() } });
        task.status = "COMPLETED";
      }
      dtos.push(toDTO(task, task.status === "COMPLETED" ? null : nextSlug, task.checklistItems));
    } else {
      dtos.push(toDTO(task, null, task.checklistItems));
    }
  }

  const completed = dtos.filter((t) => t.status === "COMPLETED").length;
  return { date: date.toISOString().slice(0, 10), total: dtos.length, completed, tasks: dtos };
}

async function loadOwnedTask(userId: string, taskId: string): Promise<TaskWithChecklist> {
  const task = await prisma.dailyTask.findUnique({ where: { id: taskId }, include: { checklistItems: true } });
  if (!task || task.userId !== userId) throw new AuthError(404, "task_not_found");
  return task as TaskWithChecklist;
}

/** Manually complete a task WITHOUT a checklist. Checklist tasks complete via
 * their items; automatic/blocked tasks can never be forged. */
export async function completeTask(userId: string, taskId: string): Promise<DailyTaskDTO> {
  const task = await loadOwnedTask(userId, taskId);
  if (taskMode(task.category) !== "manual") throw new AuthError(403, "manual_not_allowed", "Эта задача выполняется системой");
  if (task.checklistItems.length > 0) throw new AuthError(409, "checklist_required", "Отметьте пункты чек-листа");
  const updated = await prisma.dailyTask.update({
    where: { id: taskId },
    data: { status: "COMPLETED", completedAt: task.completedAt ?? new Date() },
  });
  return toDTO(updated, null, []);
}

export async function skipTask(userId: string, taskId: string): Promise<DailyTaskDTO> {
  const task = await loadOwnedTask(userId, taskId);
  if (taskMode(task.category) !== "manual") throw new AuthError(403, "manual_not_allowed", "Эту задачу нельзя пропустить");
  if (task.checklistItems.length > 0) throw new AuthError(409, "checklist_required", "У задачи есть чек-лист");
  const updated = await prisma.dailyTask.update({ where: { id: taskId }, data: { status: "SKIPPED" } });
  return toDTO(updated, null, task.checklistItems);
}

/** Toggle one checklist item of the user's OWN task. Recomputes task status:
 * COMPLETED when all required items are done (else back to TODO). Idempotent /
 * double-tap safe (single-row item update + deterministic recompute). No XP. */
export async function toggleChecklistItem(
  userId: string,
  taskId: string,
  itemId: string,
  done: boolean,
): Promise<DailyTaskDTO> {
  const task = await loadOwnedTask(userId, taskId); // ownership enforced
  const item = task.checklistItems.find((c) => c.itemId === itemId);
  if (!item) throw new AuthError(404, "item_not_found");
  if (taskMode(task.category) !== "manual") throw new AuthError(403, "not_editable");

  if (item.done !== done) {
    await prisma.dailyTaskChecklistItem.update({ where: { id: item.id }, data: { done, doneAt: done ? new Date() : null } });
    item.done = done;
  }
  const complete = isChecklistComplete(task.checklistItems);
  const nextStatus = complete ? "COMPLETED" : "TODO";
  const updated =
    task.status !== nextStatus
      ? await prisma.dailyTask.update({
          where: { id: taskId },
          data: { status: nextStatus, completedAt: complete ? task.completedAt ?? new Date() : null },
        })
      : task;
  return toDTO(updated, null, task.checklistItems);
}
