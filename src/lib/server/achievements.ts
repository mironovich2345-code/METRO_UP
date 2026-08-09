import "server-only";
import { prisma } from "./db";
import { ACHIEVEMENT_BY_CODE, ACHIEVEMENT_CATALOG } from "./achievements-catalog";
import type { AchievementDTO } from "@/lib/api/home-types";

/**
 * Achievement engine — server-side, idempotent, extensible. Awards are recorded
 * in UserAchievement with a unique(userId, achievementId), so re-evaluation never
 * duplicates. Only inputs that already exist in production are evaluated this
 * sprint (lesson completions, perfect quiz); others stay defined but unearned.
 */

async function ensureDefinition(code: string): Promise<string | null> {
  const def = ACHIEVEMENT_BY_CODE.get(code);
  if (!def) return null;
  const row = await prisma.achievementDefinition.upsert({
    where: { code },
    update: { title: def.title, description: def.description, category: def.category, icon: def.icon },
    create: { code, title: def.title, description: def.description, category: def.category, icon: def.icon },
  });
  return row.id;
}

/** Award an achievement once (idempotent). */
export async function awardAchievement(
  userId: string,
  code: string,
  sourceType: string,
  sourceId?: string,
): Promise<void> {
  const achievementId = await ensureDefinition(code);
  if (!achievementId) return;
  await prisma.userAchievement.createMany({
    data: [{ userId, achievementId, sourceType, sourceId: sourceId ?? null }],
    skipDuplicates: true,
  });
}

/**
 * Re-evaluate a user's achievements from real production data. Safe to call
 * after any lesson/quiz event. Only lesson/quiz-driven achievements are wired.
 */
export async function evaluateAchievements(userId: string): Promise<void> {
  const [completedLessons, perfectQuizzes] = await Promise.all([
    prisma.lessonProgress.count({ where: { userId, status: "COMPLETED" } }),
    prisma.quizAttempt.count({ where: { userId, scorePercent: 100 } }),
  ]);

  if (completedLessons >= 1) await awardAchievement(userId, "FIRST_LESSON", "LESSON");
  if (completedLessons >= 10) await awardAchievement(userId, "ACADEMY_10", "LESSON");
  if (completedLessons >= 25) await awardAchievement(userId, "ACADEMY_25", "LESSON");
  if (perfectQuizzes >= 1) await awardAchievement(userId, "PERFECT_QUIZ", "QUIZ");
}

export async function countUserAchievements(userId: string): Promise<number> {
  return prisma.userAchievement.count({ where: { userId } });
}

/** The most recently awarded achievement (title + date), or null. */
export async function getLastAchievement(
  userId: string,
): Promise<{ title: string; awardedAt: string } | null> {
  const row = await prisma.userAchievement.findFirst({
    where: { userId },
    orderBy: { awardedAt: "desc" },
    include: { achievement: { select: { code: true } } },
  });
  if (!row) return null;
  const def = ACHIEVEMENT_BY_CODE.get(row.achievement.code);
  return { title: def?.title ?? row.achievement.code, awardedAt: row.awardedAt.toISOString() };
}

/** Full catalog with awarded flags for the current user. */
export async function getUserAchievements(userId: string): Promise<AchievementDTO[]> {
  const awarded = await prisma.userAchievement.findMany({
    where: { userId },
    include: { achievement: { select: { code: true } } },
  });
  const byCode = new Map(awarded.map((a) => [a.achievement.code, a.awardedAt]));
  return ACHIEVEMENT_CATALOG.map((def) => ({
    code: def.code,
    title: def.title,
    description: def.description,
    category: def.category,
    icon: def.icon,
    awarded: byCode.has(def.code),
    awardedAt: byCode.get(def.code)?.toISOString() ?? null,
  }));
}
