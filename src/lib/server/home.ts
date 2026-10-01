import "server-only";
import type { CurrentUser } from "./session";
import { getPlanToday, getPlanTodayFor } from "./daily-plan";
import { getXpBalance } from "./progress";
import { getRatingSummary } from "./rating";
import { getMysterySummary } from "./mystery";
import { countUserAchievements, getLastAchievement } from "./achievements";
import { settleWidget } from "./home-resolve";
import { getPositionById } from "@/content/positions";
import { getClubById, getCityById } from "@/content/cities";
import { resolveOnboardingProgramId, getAcademyOverview } from "./academy";
import { getCityManagerHomeBlock, getClubManagerHomeBlock } from "./rbac/cabinet-dashboards";
import type { ActorContext } from "./rbac/types";
import type { ClubSummary } from "./rbac/context";
import { logPerf, timedField } from "./perf";
import type {
  CityManagerHomeContextDTO,
  ClubManagerHomeContextDTO,
  DailyPlanDTO,
  HomeContextDTO,
  HomeDashboardDTO,
  MysterySummaryDTO,
  OnboardingHomeDTO,
  RatingSummaryDTO,
} from "@/lib/api/home-types";
import type { XPBalanceDTO } from "@/lib/api/content-types";

// Safe empty fallbacks (existing DTO shapes) used when a widget fails — the
// public response schema is unchanged; each card renders its honest empty state.
const EMPTY_PLAN: DailyPlanDTO = { date: "", total: 0, completed: 0, tasks: [] };
const EMPTY_XP: XPBalanceDTO = { total: 0, today: 0, recent: [] };
const EMPTY_RATING: RatingSummaryDTO = { hasData: false };
const EMPTY_MYSTERY: MysterySummaryDTO = { hasData: false };

/**
 * PERSONAL context — Sprint: mini-app-context-switcher, section 4:
 * "as close as possible to the pre-role-refactor MANAGER experience." Same
 * aggregate this function has always computed (profile, daily plan top 3,
 * XP, rating summary, mystery summary, achievement count) — NO management
 * data of any kind is resolved or attached here anymore; a CITY_MANAGER/
 * CLUB_MANAGER context is a completely separate response (see
 * getCityManagerHomeDashboard/getClubManagerHomeDashboard below), never
 * appended to this one. Each widget stays FAULT-ISOLATED (ported from main's
 * dc9f8e8 — see home-resolve.ts): one failing data call degrades only that
 * card, never the whole response.
 *
 * Real users ONLY — this calls getPlanToday(), which materializes today's
 * DailyTask rows (daily-plan.ts's ensureTodayTasks). See getHomeDashboardFor
 * below for the View As entry point, which must never reach that write.
 */
export async function getHomeDashboard(
  user: CurrentUser,
  availableContexts: HomeContextDTO[],
  activeContext: HomeContextDTO,
): Promise<HomeDashboardDTO> {
  // Sprint: mini-app-server-startup, section 4 — PERF_LOG=1-only per-widget
  // breakdown. Each field is that ONE widget's own wall time; since all six
  // run concurrently via Promise.all, totalMs close to max(fields) means
  // real parallelism, totalMs close to sum(fields) means something (most
  // likely Prisma's connection pool) is serializing them despite the
  // concurrent await — see the report's "Home bottleneck" section.
  const timings: Record<string, number> = {};
  const totalStart = performance.now();
  const [plan, xp, rating, mystery, achievementsCount, lastAchievement] = await Promise.all([
    settleWidget("plan", timedField(timings, "planMs", () => getPlanToday(user)), EMPTY_PLAN),
    settleWidget("xp", timedField(timings, "xpMs", () => getXpBalance(user.id)), EMPTY_XP),
    settleWidget("rating", timedField(timings, "ratingMs", () => getRatingSummary(user.id)), EMPTY_RATING),
    settleWidget("mystery", timedField(timings, "mysteryMs", () => getMysterySummary(user.id)), EMPTY_MYSTERY),
    settleWidget("achievements_count", timedField(timings, "achievementsMs", () => countUserAchievements(user.id)), 0),
    settleWidget<Awaited<ReturnType<typeof getLastAchievement>>>(
      "last_achievement",
      timedField(timings, "lastAchievementMs", () => getLastAchievement(user.id)),
      null,
    ),
  ]);
  logPerf("perf-home-personal", { totalMs: Math.round(performance.now() - totalStart), ...timings });

  return {
    kind: "full",
    profile: profileCard(user),
    plan: { total: plan.total, completed: plan.completed, tasks: plan.tasks.slice(0, 3) },
    xp: { total: xp.total, today: xp.today },
    rating,
    mystery,
    achievementsCount,
    lastAchievement,
    availableContexts,
    activeContext,
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

const PERSONAL: HomeContextDTO = { type: "PERSONAL", label: "Личный кабинет" };

/**
 * Sprint 1 / Phase 2D — View As entry point for /api/home during an active
 * MANAGER persona preview ONLY (Sprint: mini-app-context-switcher, section
 * 13: View As is a SEPARATE mechanism from context switching — while this
 * preview is active, context switching does not apply at all, so the
 * response always carries an empty availableContexts + the bare PERSONAL
 * activeContext, exactly matching the real employee experience this preview
 * exists to show). The caller (api/home/route.ts) is what decides whether
 * this or getHomeDashboard/getCityManagerHomeDashboard/
 * getClubManagerHomeDashboard applies — this function assumes the
 * MANAGER-preview branch has already been chosen.
 *
 * Deliberately does NOT call getPlanToday(): that function's
 * ensureTodayTasks() step INSERTs DailyTask rows keyed on userId, which has
 * a NOT NULL foreign key to `users.id` — the synthetic persona's id does not
 * exist in that table, so the insert would either throw a foreign-key
 * violation (breaking the preview) or, if the FK were ever relaxed, silently
 * create orphan rows tied to a fake user. Every other card here (XP/rating/
 * mystery/achievements) is a pure read keyed by userId with no such write,
 * so those are safe to call as-is — they correctly return zeroed/empty
 * results for an id with no rows.
 */
export async function getPersonalHomeDashboardForPreview(effectiveUser: CurrentUser): Promise<HomeDashboardDTO> {
  const [xp, rating, mystery, achievementsCount, lastAchievement] = await Promise.all([
    settleWidget("xp", () => getXpBalance(effectiveUser.id), EMPTY_XP),
    settleWidget("rating", () => getRatingSummary(effectiveUser.id), EMPTY_RATING),
    settleWidget("mystery", () => getMysterySummary(effectiveUser.id), EMPTY_MYSTERY),
    settleWidget("achievements_count", () => countUserAchievements(effectiveUser.id), 0),
    settleWidget<Awaited<ReturnType<typeof getLastAchievement>>>("last_achievement", () => getLastAchievement(effectiveUser.id), null),
  ]);

  return {
    kind: "full",
    profile: profileCard(effectiveUser),
    // Honest empty state — a persona with no materialized rows genuinely
    // has no tasks today; never fabricated, never written.
    plan: { total: 0, completed: 0, tasks: [] },
    xp: { total: xp.total, today: xp.today },
    rating,
    mystery,
    achievementsCount,
    lastAchievement,
    availableContexts: [],
    activeContext: PERSONAL,
  };
}

/**
 * CITY_MANAGER context — Sprint: mini-app-context-switcher, section 5.
 * Management content ONLY (getCityManagerHomeBlock, the same step-4
 * dashboard the desktop cabinet and /city already use) — no personal Plan/
 * XP/Rating/Mystery/achievements anywhere on this response.
 */
export async function getCityManagerHomeDashboard(
  realUser: CurrentUser,
  actor: ActorContext,
  availableContexts: HomeContextDTO[],
  activeContext: HomeContextDTO,
  precomputedClubs?: ClubSummary[],
): Promise<CityManagerHomeContextDTO> {
  const totalStart = performance.now();
  const block = await getCityManagerHomeBlock(actor, precomputedClubs);
  logPerf("perf-home-city-manager", { totalMs: Math.round(performance.now() - totalStart), clubCount: block.clubCount, hadPrecomputedClubs: precomputedClubs ? "yes" : "no" });
  return { kind: "city_manager", profile: profileCard(realUser), block, availableContexts, activeContext };
}

/**
 * CLUB_MANAGER context — Sprint: mini-app-context-switcher, section 6. Item
 * 2 ("План на сегодня") reuses the EXISTING Daily Plan primitive
 * (getPlanTodayFor, already View-As-aware and already the one
 * getClubManagerDashboard/the desktop cabinet uses) — never a new plan
 * system. `effectiveUser`/`isPreviewing` mirror getHomeDashboardFor exactly:
 * a real actor's own club uses their real id; an active View-As-CLUB_MANAGER
 * preview uses the synthetic persona, which getPlanTodayFor already knows
 * not to materialize tasks for.
 */
export async function getClubManagerHomeDashboard(
  clubId: string,
  clubName: string | null,
  effectiveUser: CurrentUser,
  isPreviewing: boolean,
  availableContexts: HomeContextDTO[],
  activeContext: HomeContextDTO,
): Promise<ClubManagerHomeContextDTO> {
  const timings: Record<string, number> = {};
  const totalStart = performance.now();
  const [plan, block] = await Promise.all([
    settleWidget("plan", timedField(timings, "planMs", () => getPlanTodayFor(effectiveUser, isPreviewing)), EMPTY_PLAN),
    timedField(timings, "blockMs", () => getClubManagerHomeBlock(clubId, clubName, isPreviewing))(),
  ]);
  logPerf("perf-home-club-manager", { totalMs: Math.round(performance.now() - totalStart), ...timings });
  return {
    kind: "club_manager",
    profile: profileCard(effectiveUser),
    plan: { total: plan.total, completed: plan.completed, tasks: plan.tasks.slice(0, 3) },
    block,
    availableContexts,
    activeContext,
  };
}

/**
 * Sprint: mini-app-role-experience, section 2 — the PENDING_APPROVAL Home
 * read model. Deliberately tiny: profile + one onboarding-course summary,
 * nothing else — no context concept applies to this state at all (no
 * availableContexts field even exists on OnboardingHomeDTO). Reuses
 * getAcademyOverview exactly as the Academy routes do, restricted to the
 * same resolveOnboardingProgramId() program — see academy.ts's
 * isAcademyContentAllowed for the shared scope rule this mirrors.
 */
export async function getOnboardingHomeDashboard(user: CurrentUser): Promise<OnboardingHomeDTO> {
  const academy = await settleWidget<OnboardingHomeDTO["academy"]>(
    "onboarding_academy",
    async () => {
      const onboardingProgramId = await resolveOnboardingProgramId();
      if (!onboardingProgramId) return null;
      const overview = await getAcademyOverview(user.id, [onboardingProgramId]);
      if (!overview.hasContent || overview.programs.length === 0) return null;
      const program = overview.programs[0];
      const totalDurationMinutes = program.days.reduce((sum, d) => sum + d.durationMinutes, 0);
      return {
        courseTitle: program.title,
        completed: overview.overall.completed,
        total: overview.overall.total,
        totalDurationMinutes,
        nextLessonSlug: overview.nextLesson?.slug ?? null,
      };
    },
    null,
  );

  return { kind: "onboarding", profile: profileCard(user), academy };
}
