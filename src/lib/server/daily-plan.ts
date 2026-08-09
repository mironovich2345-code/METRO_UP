import "server-only";
import type { DailyTask } from "@prisma/client";
import { prisma } from "./db";
import { AuthError } from "./authz";
import { appDay } from "./time";
import { getAcademyState } from "./academy";
import { DAILY_TEMPLATES, taskMode, templatesForPosition } from "./daily-plan-catalog";
import type { CurrentUser } from "./session";
import type { DailyPlanDTO, DailyTaskDTO } from "@/lib/api/home-types";

/**
 * Daily plan. System tasks are generated idempotently for the app-timezone
 * "today" (unique(userId, date, templateId) prevents duplicates). LEARNING tasks
 * auto-complete from real LessonProgress and can never be manually forged.
 */

let templateIdCache: Map<string, string> | null = null;

/** Upsert the template catalog; return a map code → templateId (cached). */
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

/** Create today's system tasks for the user (idempotent). */
async function ensureTodayTasks(user: CurrentUser, date: Date): Promise<void> {
  const position = user.employeeProfile?.positionId ?? null;
  const templates = templatesForPosition(position);
  const ids = await ensureTemplates();
  await prisma.dailyTask.createMany({
    data: templates.map((t) => ({
      userId: user.id,
      date,
      templateId: ids.get(t.code)!,
      title: t.title,
      description: t.description,
      category: t.category,
      order: t.defaultOrder,
      source: "SYSTEM" as const,
    })),
    skipDuplicates: true, // unique(userId, date, templateId)
  });
}

async function completedLessonToday(userId: string, dayStart: Date): Promise<boolean> {
  const n = await prisma.lessonProgress.count({
    where: { userId, status: "COMPLETED", completedAt: { gte: dayStart } },
  });
  return n > 0;
}

function toDTO(task: DailyTask, actionSlug: string | null): DailyTaskDTO {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    category: task.category,
    status: task.status,
    mode: taskMode(task.category),
    order: task.order,
    actionSlug,
  };
}

/** Build (and lazily generate) the user's plan for today. */
export async function getPlanToday(user: CurrentUser): Promise<DailyPlanDTO> {
  const date = appDay();
  await ensureTodayTasks(user, date);

  const [tasks, academy, learnedToday] = await Promise.all([
    prisma.dailyTask.findMany({ where: { userId: user.id, date }, orderBy: { order: "asc" } }),
    getAcademyState(user.id),
    completedLessonToday(user.id, date),
  ]);

  const nextSlug = academy.nextLesson?.slug ?? null;
  // LEARNING is "done" when a lesson was completed today, or nothing is pending.
  const learningDone = learnedToday || academy.nextLesson === null;

  const dtos: DailyTaskDTO[] = [];
  for (const task of tasks) {
    if (task.category === "LEARNING") {
      // Auto-complete from real progress (persist), never manually.
      if (learningDone && task.status === "TODO") {
        await prisma.dailyTask.update({
          where: { id: task.id },
          data: { status: "COMPLETED", completedAt: new Date() },
        });
        task.status = "COMPLETED";
      }
      dtos.push(toDTO(task, task.status === "COMPLETED" ? null : nextSlug));
    } else {
      dtos.push(toDTO(task, null));
    }
  }

  const completed = dtos.filter((t) => t.status === "COMPLETED").length;
  return { date: date.toISOString().slice(0, 10), total: dtos.length, completed, tasks: dtos };
}

async function loadOwnedTask(userId: string, taskId: string): Promise<DailyTask> {
  const task = await prisma.dailyTask.findUnique({ where: { id: taskId } });
  if (!task || task.userId !== userId) throw new AuthError(404, "task_not_found");
  return task;
}

/** Manually complete a task. Automatic/blocked tasks cannot be forged. */
export async function completeTask(userId: string, taskId: string): Promise<DailyTaskDTO> {
  const task = await loadOwnedTask(userId, taskId);
  if (taskMode(task.category) !== "manual") {
    throw new AuthError(403, "manual_not_allowed", "Эта задача выполняется системой");
  }
  const updated = await prisma.dailyTask.update({
    where: { id: taskId },
    data: { status: "COMPLETED", completedAt: task.completedAt ?? new Date() },
  });
  return toDTO(updated, null);
}

/** Skip a manual task. */
export async function skipTask(userId: string, taskId: string): Promise<DailyTaskDTO> {
  const task = await loadOwnedTask(userId, taskId);
  if (taskMode(task.category) !== "manual") {
    throw new AuthError(403, "manual_not_allowed", "Эту задачу нельзя пропустить");
  }
  const updated = await prisma.dailyTask.update({
    where: { id: taskId },
    data: { status: "SKIPPED" },
  });
  return toDTO(updated, null);
}
