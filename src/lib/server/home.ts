import "server-only";
import type { CurrentUser } from "./session";
import { getPlanToday } from "./daily-plan";
import { getXpBalance } from "./progress";
import { getRatingSummary } from "./rating";
import { getMysterySummary } from "./mystery";
import { countUserAchievements, getLastAchievement } from "./achievements";
import { getPositionById } from "@/content/positions";
import { getClubById, getCityById } from "@/content/cities";
import type { HomeDashboardDTO } from "@/lib/api/home-types";

/**
 * Single Home read model — aggregates profile, daily plan (top 3), XP, rating
 * summary, mystery summary and achievement count from PostgreSQL. No mock data;
 * missing data surfaces as honest empty states in each card.
 *
 * Real users ONLY — this calls getPlanToday(), which materializes today's
 * DailyTask rows (daily-plan.ts's ensureTodayTasks). See getHomeDashboardFor
 * below for the View As entry point, which must never reach that write.
 */
export async function getHomeDashboard(user: CurrentUser): Promise<HomeDashboardDTO> {
  const [plan, xp, rating, mystery, achievementsCount, lastAchievement] = await Promise.all([
    getPlanToday(user),
    getXpBalance(user.id),
    getRatingSummary(user.id),
    getMysterySummary(user.id),
    countUserAchievements(user.id),
    getLastAchievement(user.id),
  ]);

  return {
    profile: profileCard(user),
    plan: { total: plan.total, completed: plan.completed, tasks: plan.tasks.slice(0, 3) },
    xp: { total: xp.total, today: xp.today },
    rating,
    mystery,
    achievementsCount,
    lastAchievement,
  };
}

function profileCard(user: CurrentUser): HomeDashboardDTO["profile"] {
  const p = user.employeeProfile;
  return {
    displayName: user.displayName,
    positionTitle: p ? getPositionById(p.positionId)?.title ?? null : null,
    clubName: p ? getClubById(p.clubId)?.name ?? null : null,
    cityName: p ? getCityById(p.cityId)?.name ?? null : null,
  };
}

/**
 * Sprint 1 / Phase 2D — View As entry point for /api/home. `isPreviewing`
 * comes straight from rbac/effective-context.ts's resolveEffectiveReadContext.
 *
 * When NOT previewing this is byte-for-byte getHomeDashboard(effectiveUser)
 * (effectiveUser === realUser in that case) — zero behavior change for every
 * real user. When previewing, it deliberately does NOT call getPlanToday():
 * that function's ensureTodayTasks() step INSERTs DailyTask rows keyed on
 * userId, which has a NOT NULL foreign key to `users.id` — the synthetic
 * persona's id does not exist in that table, so the insert would either
 * throw a foreign-key violation (breaking the preview) or, if the FK were
 * ever relaxed, silently create orphan rows tied to a fake user. Every other
 * card here (XP/rating/mystery/achievements) is a pure read keyed by userId
 * with no such write, so those are safe to call as-is — they correctly
 * return zeroed/empty results for an id with no rows.
 */
export async function getHomeDashboardFor(effectiveUser: CurrentUser, isPreviewing: boolean): Promise<HomeDashboardDTO> {
  if (!isPreviewing) return getHomeDashboard(effectiveUser);

  const [xp, rating, mystery, achievementsCount, lastAchievement] = await Promise.all([
    getXpBalance(effectiveUser.id),
    getRatingSummary(effectiveUser.id),
    getMysterySummary(effectiveUser.id),
    countUserAchievements(effectiveUser.id),
    getLastAchievement(effectiveUser.id),
  ]);

  return {
    profile: profileCard(effectiveUser),
    // Honest empty state — a persona with no materialized rows genuinely
    // has no tasks today; never fabricated, never written.
    plan: { total: 0, completed: 0, tasks: [] },
    xp: { total: xp.total, today: xp.today },
    rating,
    mystery,
    achievementsCount,
    lastAchievement,
  };
}
