import "server-only";
import type { CurrentUser } from "./session";
import { getPlanToday } from "./daily-plan";
import { getXpBalance } from "./progress";
import { getRatingSummary } from "./rating";
import { getMysterySummary } from "./mystery";
import { countUserAchievements, getLastAchievement } from "./achievements";
import { settleWidget } from "./home-resolve";
import { getPositionById } from "@/content/positions";
import { getClubById, getCityById } from "@/content/cities";
import type { DailyPlanDTO, HomeDashboardDTO, MysterySummaryDTO, RatingSummaryDTO } from "@/lib/api/home-types";
import type { XPBalanceDTO } from "@/lib/api/content-types";

// Safe empty fallbacks (existing DTO shapes) used when a widget fails — the
// public response schema is unchanged; each card renders its honest empty state.
const EMPTY_PLAN: DailyPlanDTO = { date: "", total: 0, completed: 0, tasks: [] };
const EMPTY_XP: XPBalanceDTO = { total: 0, today: 0, recent: [] };
const EMPTY_RATING: RatingSummaryDTO = { hasData: false };
const EMPTY_MYSTERY: MysterySummaryDTO = { hasData: false };

/**
 * Single Home read model — aggregates profile, daily plan (top 3), XP, rating
 * summary, mystery summary and achievement count from PostgreSQL. No mock data;
 * missing data surfaces as honest empty states in each card. Each widget is
 * FAULT-ISOLATED: one failing data call degrades only that card (logged), it can
 * never make /api/home 500 and blank the whole page.
 */
export async function getHomeDashboard(user: CurrentUser): Promise<HomeDashboardDTO> {
  const [plan, xp, rating, mystery, achievementsCount, lastAchievement] = await Promise.all([
    settleWidget("plan", () => getPlanToday(user), EMPTY_PLAN),
    settleWidget("xp", () => getXpBalance(user.id), EMPTY_XP),
    settleWidget("rating", () => getRatingSummary(user.id), EMPTY_RATING),
    settleWidget("mystery", () => getMysterySummary(user.id), EMPTY_MYSTERY),
    settleWidget("achievements_count", () => countUserAchievements(user.id), 0),
    settleWidget<Awaited<ReturnType<typeof getLastAchievement>>>("last_achievement", () => getLastAchievement(user.id), null),
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
