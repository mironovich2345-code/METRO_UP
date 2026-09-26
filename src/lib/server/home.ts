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
import { resolveOnboardingProgramId, getAcademyOverview } from "./academy";
import { resolveManagementHomeBlock } from "./rbac/cabinet-dashboards";
import { formatRoleLabel } from "@/lib/cabinet-ui";
import type { EffectiveReadContext } from "./rbac/effective-context";
import type { ViewContext } from "./rbac/view-as";
import type {
  DailyPlanDTO,
  HomeDashboardDTO,
  ManagementHomeBlockDTO,
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
 * Single Home read model — aggregates profile, daily plan (top 3), XP, rating
 * summary, mystery summary and achievement count from PostgreSQL. No mock data;
 * missing data surfaces as honest empty states in each card. Each widget is
 * FAULT-ISOLATED (ported from main's dc9f8e8 — see home-resolve.ts): one
 * failing data call degrades only that card (logged via
 * settleWidget/logHomeWidgetError), it can never make /api/home 500 and blank
 * the whole page.
 *
 * Real users ONLY — this calls getPlanToday(), which materializes today's
 * DailyTask rows (daily-plan.ts's ensureTodayTasks). See getHomeDashboardFor
 * below for the View As entry point, which must never reach that write.
 *
 * Sprint: mini-app-role-experience, section 5 — `viewContext` is passed
 * through untouched to resolveManagementHomeBlock purely so a CITY_MANAGER's
 * own self-preview (previewRole "CITY_MANAGER", isPreviewing already false —
 * see effective-context.ts) still resolves the SAME management block as no
 * preview at all, rather than this function having to know about that case
 * itself. `management`/`roleLabel` are additive fields only — every existing
 * field (`plan`/`xp`/`rating`/`mystery`/`achievementsCount`/`lastAchievement`)
 * is untouched, so a plain MANAGER's Home (management: null) is byte-for-byte
 * what it always was, plus the two new fields.
 */
export async function getHomeDashboard(user: CurrentUser, viewContext: ViewContext | null = null): Promise<HomeDashboardDTO> {
  const [plan, xp, rating, mystery, achievementsCount, lastAchievement, management] = await Promise.all([
    settleWidget("plan", () => getPlanToday(user), EMPTY_PLAN),
    settleWidget("xp", () => getXpBalance(user.id), EMPTY_XP),
    settleWidget("rating", () => getRatingSummary(user.id), EMPTY_RATING),
    settleWidget("mystery", () => getMysterySummary(user.id), EMPTY_MYSTERY),
    settleWidget("achievements_count", () => countUserAchievements(user.id), 0),
    settleWidget<Awaited<ReturnType<typeof getLastAchievement>>>("last_achievement", () => getLastAchievement(user.id), null),
    settleWidget<ManagementHomeBlockDTO | null>("management", () => resolveManagementHomeBlock(user, viewContext), null),
  ]);

  return {
    kind: "full",
    profile: profileCard(user),
    plan: { total: plan.total, completed: plan.completed, tasks: plan.tasks.slice(0, 3) },
    xp: { total: xp.total, today: xp.today },
    rating,
    mystery,
    achievementsCount,
    lastAchievement,
    roleLabel: formatRoleLabel(management),
    management,
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
 * Sprint 1 / Phase 2D — View As entry point for /api/home. Takes the whole
 * EffectiveReadContext (not just effectiveUser/isPreviewing) because Sprint:
 * mini-app-role-experience's management block needs BOTH the real actor
 * (whose actual grants decide CITY_MANAGER/CLUB_MANAGER precedence — a
 * synthetic persona has no RoleAssignment rows of its own) and the raw
 * viewContext (which preview role/club is active) — see
 * rbac/cabinet-dashboards.ts's resolveManagementHomeBlock.
 *
 * When NOT previewing this is byte-for-byte getHomeDashboard(effectiveUser,
 * viewContext) (effectiveUser === realUser in that case) — zero behavior
 * change for every real user. When previewing, it deliberately does NOT call
 * getPlanToday(): that function's ensureTodayTasks() step INSERTs DailyTask
 * rows keyed on userId, which has a NOT NULL foreign key to `users.id` — the
 * synthetic persona's id does not exist in that table, so the insert would
 * either throw a foreign-key violation (breaking the preview) or, if the FK
 * were ever relaxed, silently create orphan rows tied to a fake user. Every
 * other card here (XP/rating/mystery/achievements) is a pure read keyed by
 * userId with no such write, so those are safe to call as-is — they correctly
 * return zeroed/empty results for an id with no rows. `management` is resolved
 * against realUser (never effectiveUser) for the same reason — section 18:
 * previewing MANAGER suppresses it entirely; previewing CLUB_MANAGER shows
 * that club's block with isPreviewing:true; the CITY_MANAGER-previews-CLUB_
 * MANAGER read-only guarantee is enforced independently, server-side, by the
 * View As middleware blocking writes — this flag only affects what renders.
 *
 * Same fault isolation as getHomeDashboard applies here — each of the 6 live
 * widgets is wrapped in settleWidget, so a failure while previewing degrades
 * only that card, exactly like it would for a real user. `plan` is not a
 * settleWidget call at all: it's a fixed empty value, not a data call that
 * can fail, so there's nothing to isolate.
 */
export async function getHomeDashboardFor(ctx: EffectiveReadContext): Promise<HomeDashboardDTO> {
  const { realUser, effectiveUser, isPreviewing, viewContext } = ctx;
  if (!isPreviewing) return getHomeDashboard(effectiveUser, viewContext);

  const [xp, rating, mystery, achievementsCount, lastAchievement, management] = await Promise.all([
    settleWidget("xp", () => getXpBalance(effectiveUser.id), EMPTY_XP),
    settleWidget("rating", () => getRatingSummary(effectiveUser.id), EMPTY_RATING),
    settleWidget("mystery", () => getMysterySummary(effectiveUser.id), EMPTY_MYSTERY),
    settleWidget("achievements_count", () => countUserAchievements(effectiveUser.id), 0),
    settleWidget<Awaited<ReturnType<typeof getLastAchievement>>>("last_achievement", () => getLastAchievement(effectiveUser.id), null),
    settleWidget<ManagementHomeBlockDTO | null>("management", () => resolveManagementHomeBlock(realUser, viewContext), null),
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
    roleLabel: formatRoleLabel(management),
    management,
  };
}

/**
 * Sprint: mini-app-role-experience, section 2 — the PENDING_APPROVAL Home
 * read model. Deliberately tiny: profile + one onboarding-course summary,
 * nothing else (no plan/xp/rating/mystery/management — those fields don't
 * exist on OnboardingHomeDTO at all, so there is no way for this to leak
 * restricted data even by accident). Reuses getAcademyOverview exactly as the
 * Academy routes do, restricted to the same resolveOnboardingProgramId()
 * program — see academy.ts's isAcademyContentAllowed for the shared
 * scope rule this mirrors.
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
