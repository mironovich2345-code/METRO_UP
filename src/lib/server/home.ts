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

  const p = user.employeeProfile;
  const profile = {
    displayName: user.displayName,
    positionTitle: p ? getPositionById(p.positionId)?.title ?? null : null,
    clubName: p ? getClubById(p.clubId)?.name ?? null : null,
    cityName: p ? getCityById(p.cityId)?.name ?? null : null,
  };

  return {
    profile,
    plan: { total: plan.total, completed: plan.completed, tasks: plan.tasks.slice(0, 3) },
    xp: { total: xp.total, today: xp.today },
    rating,
    mystery,
    achievementsCount,
    lastAchievement,
  };
}
