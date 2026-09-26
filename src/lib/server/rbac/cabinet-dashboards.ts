import "server-only";
import { prisma } from "../db";
import { getPositionById } from "@/content/positions";
import { getClubById } from "@/content/cities";
import { getPlanTodayFor } from "../daily-plan";
import { settleWidget } from "../home-resolve";
import type { CurrentUser } from "../session";
import { anyGrantCoversClub, grantCoversCityOrItsClubs } from "./scope-core";
import { getActorContext, cityIdForClub, resolveCityManagerClubs, type ClubSummary } from "./context";
import { authorize } from "./authorize-core";
import { resolveEffectiveReadContext } from "./effective-context";
import type { ActorContext, RoleGrant } from "./types";
import type {
  AttentionItemDTO,
  CityManagerRefDTO,
  ClubManagerAssignmentDTO,
  ClubManagerDashboardDTO,
  ClubManagerTeamDTO,
  ClubTrainingSummaryDTO,
  CabinetTeamMemberDTO,
  CityManagerClubSummaryDTO,
  CityManagerDashboardDTO,
  OperationsDirectorCitySummaryDTO,
  OperationsDirectorDashboardDTO,
  TrainingSummaryDTO,
} from "@/lib/api/cabinet-types";

/**
 * Sprint: role-cabinets, step 4 — server read models for the
 * OPERATIONS_DIRECTOR / CITY_MANAGER / CLUB_MANAGER cabinets. No UI consumes
 * this yet (see the API routes under src/app/api/control/cabinet/*, added in
 * this same step, which are the only current callers).
 *
 * ============================================================================
 * ACADEMY / TRAINING SEMANTICS — READ THIS BEFORE CHANGING ANY NUMBER BELOW
 * ============================================================================
 * Academy Audience (per-position/city/club required courses) does not exist
 * yet (schema.prisma's Lesson has no audience/position/scope column at all —
 * verified by reading it). Today, EVERY employee's "curriculum" is the exact
 * same set of PUBLISHED lessons, system-wide — this is what
 * getAcademyOverview/getAcademyState already compute per-user (see
 * src/lib/server/academy.ts). There is no "required for your role", no due
 * date, no "overdue" concept anywhere in the data model.
 *
 * Every training number this file produces is therefore honestly one thing:
 * (completed lessons) / (total PUBLISHED lessons, system-wide, today) — never
 * "compliance", never "assigned training status". Where that denominator is
 * 0 (no published lessons yet) or the employee count in scope is 0, the
 * corresponding percent is `null`, never a fabricated 0 or 100.
 *
 * TRAINING_INCOMPLETE is deliberately NOT implemented as an attention
 * category in this step: with no due date/required-by concept, "hasn't
 * finished 100% of the curriculum yet" is true for most employees at any
 * given time — it would flood the attention list with non-actionable noise,
 * not surface something meaningful. The aggregate SUMMARY numbers
 * (averageProgressPercent / employeesCompletedAll / employeesInTraining) are
 * still provided, since those ARE meaningful in aggregate even though a
 * single "you're behind" flag per employee is not, yet. Revisit once Academy
 * Audience defines what "required" and "overdue" actually mean.
 * ============================================================================
 *
 * QUERY STRATEGY — every list below is fetched with ONE batched query per
 * data source (employees, grants, lesson progress), never per-row/per-club/
 * per-employee. The one query flagged as potentially expensive at full
 * network scale is loadTrainingRaw's lessonProgress.groupBy, which scans
 * every in-scope employee's progress rows in a single pass — fine at this
 * chain's employee counts, the first thing to revisit if that ever changes.
 */

const EMPLOYEE_WHERE = { role: "EMPLOYEE" as const };

interface EmployeeRow {
  userId: string;
  clubId: string;
  displayName: string;
  positionId: string;
  accessStatus: "LIMITED" | "PENDING_APPROVAL" | "FULL" | "SUSPENDED";
  onboardingCompleted: boolean;
}

/** The one query every dashboard's employee-shaped numbers derive from —
 * batched, never re-run per club/city. */
async function loadEmployees(clubIds?: string[]): Promise<EmployeeRow[]> {
  const rows = await prisma.employeeProfile.findMany({
    where: { user: EMPLOYEE_WHERE, ...(clubIds ? { clubId: { in: clubIds } } : {}) },
    select: {
      userId: true,
      clubId: true,
      positionId: true,
      accessStatus: true,
      onboardingCompleted: true,
      user: { select: { displayName: true } },
    },
  });
  return rows.map((r) => ({
    userId: r.userId,
    clubId: r.clubId,
    displayName: r.user.displayName,
    positionId: r.positionId,
    accessStatus: r.accessStatus,
    onboardingCompleted: r.onboardingCompleted,
  }));
}

/** Batched: current global PUBLISHED-lesson count (same for everyone) plus,
 * for the given user ids, how many each has completed. One query each. */
interface TrainingRaw {
  totalPublishedLessons: number;
  completedByUser: Map<string, number>;
}
const EMPTY_TRAINING_RAW: TrainingRaw = { totalPublishedLessons: 0, completedByUser: new Map() };

/**
 * Sprint: role-cabinets, step 4, section 18 — the resilience lesson from
 * Home: training is an OPTIONAL aggregate layered on top of the dashboard's
 * core scope/membership data (summary counts, club/employee lists, attention
 * items for missing managers/pending approvals) — none of that depends on
 * Academy data at all. A failure here (e.g. a transient Lesson/LessonProgress
 * query problem) must degrade to the same honest "no data" empty state
 * already used when there's genuinely nothing to report (totalPublishedLessons
 * = 0), never 500 the whole cabinet. Reuses home-resolve.ts's settleWidget
 * unchanged — same non-PII `[home-widget-error]` logging contract. Core
 * auth/scope failures (an invalid clubId, an actor without the right grant)
 * happen entirely BEFORE this is ever called and are unaffected.
 */
async function loadTrainingRaw(userIds: string[]): Promise<TrainingRaw> {
  return settleWidget("cabinet_training", async () => {
    const [totalPublishedLessons, completedRows] = await Promise.all([
      prisma.lesson.count({ where: { status: "PUBLISHED" } }),
      userIds.length
        ? prisma.lessonProgress.groupBy({
            by: ["userId"],
            where: { userId: { in: userIds }, status: "COMPLETED" },
            _count: { _all: true },
          })
        : Promise.resolve([]),
    ]);
    const completedByUser = new Map(completedRows.map((r) => [r.userId, r._count._all]));
    return { totalPublishedLessons, completedByUser };
  }, EMPTY_TRAINING_RAW);
}

/** Aggregate TrainingSummaryDTO (percent-shaped — OperationsDirector/CityManager). */
function summarizeTraining(
  userIds: string[],
  totalPublishedLessons: number,
  completedByUser: Map<string, number>,
): TrainingSummaryDTO | null {
  if (userIds.length === 0) return null;
  if (totalPublishedLessons === 0) {
    return { totalPublishedLessons: 0, employeeCount: userIds.length, averageProgressPercent: null, employeesCompletedAll: 0 };
  }
  let sumPercent = 0;
  let completedAll = 0;
  for (const id of userIds) {
    const done = completedByUser.get(id) ?? 0;
    sumPercent += (done / totalPublishedLessons) * 100;
    if (done >= totalPublishedLessons) completedAll += 1;
  }
  return {
    totalPublishedLessons,
    employeeCount: userIds.length,
    averageProgressPercent: Math.round((sumPercent / userIds.length) * 10) / 10,
    employeesCompletedAll: completedAll,
  };
}

/** Same idea, shaped for ClubManagerDashboard's simpler "in training / done" split. */
function summarizeClubTraining(
  userIds: string[],
  totalPublishedLessons: number,
  completedByUser: Map<string, number>,
): ClubTrainingSummaryDTO | null {
  if (userIds.length === 0) return null;
  if (totalPublishedLessons === 0) {
    return { totalPublishedLessons: 0, employeesInTraining: 0, employeesCompleted: 0 };
  }
  let inTraining = 0;
  let completed = 0;
  for (const id of userIds) {
    const done = completedByUser.get(id) ?? 0;
    if (done >= totalPublishedLessons) completed += 1;
    else if (done > 0) inTraining += 1;
  }
  return { totalPublishedLessons, employeesInTraining: inTraining, employeesCompleted: completed };
}

/* --------------------------- OPERATIONS_DIRECTOR --------------------------- */

export async function getOperationsDirectorDashboard(): Promise<OperationsDirectorDashboardDTO> {
  const [cities, employees, cityManagerGrantsRaw, clubManagerGrantsRaw] = await Promise.all([
    prisma.city.findMany({
      where: { isActive: true },
      select: { id: true, name: true, clubs: { where: { isActive: true }, select: { id: true, name: true } } },
      orderBy: { name: "asc" },
    }),
    loadEmployees(),
    prisma.roleAssignment.findMany({
      where: { role: "CITY_MANAGER", status: "ACTIVE" },
      select: { role: true, scopeType: true, cityId: true, clubId: true, status: true, userId: true },
    }),
    prisma.roleAssignment.findMany({
      where: { role: "CLUB_MANAGER", status: "ACTIVE" },
      select: { role: true, scopeType: true, cityId: true, clubId: true, status: true },
    }),
  ]);
  const cityManagerGrants = cityManagerGrantsRaw as unknown as (RoleGrant & { userId: string })[];
  const clubManagerGrants = clubManagerGrantsRaw as unknown as RoleGrant[];

  const cmUserIds = [...new Set(cityManagerGrants.map((g) => g.userId))];
  const cmUsers = cmUserIds.length
    ? await prisma.user.findMany({ where: { id: { in: cmUserIds } }, select: { id: true, displayName: true } })
    : [];
  const cmDisplayName = new Map(cmUsers.map((u) => [u.id, u.displayName]));

  const clubToCity = new Map<string, string>();
  for (const city of cities) for (const club of city.clubs) clubToCity.set(club.id, city.id);

  const employeesByClub = new Map<string, EmployeeRow[]>();
  for (const e of employees) {
    const list = employeesByClub.get(e.clubId) ?? [];
    list.push(e);
    employeesByClub.set(e.clubId, list);
  }

  const { totalPublishedLessons, completedByUser } = await loadTrainingRaw(employees.map((e) => e.userId));
  const training = summarizeTraining(
    employees.map((e) => e.userId),
    totalPublishedLessons,
    completedByUser,
  );

  const attention: AttentionItemDTO[] = [];
  const citySummaries: OperationsDirectorCitySummaryDTO[] = [];

  for (const city of cities) {
    const cityEmployees = city.clubs.flatMap((c) => employeesByClub.get(c.id) ?? []);
    const pendingInCity = cityEmployees.filter((e) => e.accessStatus === "PENDING_APPROVAL");

    const cityClubIds = city.clubs.map((c) => c.id);
    const coveringGrants = cityManagerGrants.filter((g) => grantCoversCityOrItsClubs(g, city.id, cityClubIds));
    const cityManagers: CityManagerRefDTO[] = [...new Set(coveringGrants.map((g) => g.userId))].map((userId) => ({
      userId,
      displayName: cmDisplayName.get(userId) ?? "—",
    }));

    let cityAttentionCount = 0;
    if (cityManagers.length === 0) {
      attention.push({ category: "CITY_WITHOUT_CITY_MANAGER", entityType: "city", entityId: city.id, entityName: city.name, cityId: city.id, clubId: null });
      cityAttentionCount += 1;
    }
    for (const club of city.clubs) {
      const hasClubManager = anyGrantCoversClub(clubManagerGrants, "CLUB_MANAGER", club.id, city.id);
      if (!hasClubManager) {
        attention.push({ category: "CLUB_WITHOUT_CLUB_MANAGER", entityType: "club", entityId: club.id, entityName: club.name, cityId: city.id, clubId: club.id });
        cityAttentionCount += 1;
      }
    }
    for (const e of pendingInCity) {
      attention.push({ category: "PENDING_EMPLOYEE_APPROVAL", entityType: "employee", entityId: e.userId, entityName: e.displayName, cityId: city.id, clubId: e.clubId });
      cityAttentionCount += 1;
    }

    let trainingCompletionPercent: number | null = null;
    if (totalPublishedLessons > 0 && cityEmployees.length > 0) {
      const sum = cityEmployees.reduce((acc, e) => acc + ((completedByUser.get(e.userId) ?? 0) / totalPublishedLessons) * 100, 0);
      trainingCompletionPercent = Math.round((sum / cityEmployees.length) * 10) / 10;
    }

    citySummaries.push({
      cityId: city.id,
      cityName: city.name,
      clubCount: city.clubs.length,
      employeeCount: cityEmployees.length,
      activeCityManagerCount: coveringGrants.length,
      cityManagers,
      pendingApprovalCount: pendingInCity.length,
      attentionCount: cityAttentionCount,
      trainingCompletionPercent,
    });
  }

  return {
    summary: {
      cityCount: cities.length,
      clubCount: cities.reduce((n, c) => n + c.clubs.length, 0),
      employeeCount: employees.length,
      cityManagerCount: cityManagerGrants.length,
      pendingApprovalCount: employees.filter((e) => e.accessStatus === "PENDING_APPROVAL").length,
    },
    training,
    attention,
    cities: citySummaries,
  };
}

/* ------------------------------ CITY_MANAGER -------------------------------- */

export async function getCityManagerDashboard(actor: ActorContext): Promise<CityManagerDashboardDTO> {
  const clubs: ClubSummary[] = await resolveCityManagerClubs(actor);
  const clubIds = clubs.map((c) => c.id);

  const [employees, clubManagerGrantsRaw] = await Promise.all([
    loadEmployees(clubIds),
    clubIds.length
      ? prisma.roleAssignment.findMany({
          where: { role: "CLUB_MANAGER", status: "ACTIVE", clubId: { in: clubIds } },
          select: { id: true, role: true, scopeType: true, cityId: true, clubId: true, status: true, userId: true, startedAt: true },
        })
      : Promise.resolve([]),
  ]);
  const clubManagerGrants = clubManagerGrantsRaw as unknown as (RoleGrant & { id: string; userId: string; startedAt: Date })[];

  const cmUserIds = [...new Set(clubManagerGrants.map((g) => g.userId))];
  const cmUsers = cmUserIds.length
    ? await prisma.user.findMany({ where: { id: { in: cmUserIds } }, select: { id: true, displayName: true } })
    : [];
  const cmDisplayName = new Map(cmUsers.map((u) => [u.id, u.displayName]));
  const clubNameById = new Map(clubs.map((c) => [c.id, c.name]));

  const employeesByClub = new Map<string, EmployeeRow[]>();
  for (const e of employees) {
    const list = employeesByClub.get(e.clubId) ?? [];
    list.push(e);
    employeesByClub.set(e.clubId, list);
  }

  const { totalPublishedLessons, completedByUser } = await loadTrainingRaw(employees.map((e) => e.userId));
  const training = summarizeTraining(
    employees.map((e) => e.userId),
    totalPublishedLessons,
    completedByUser,
  );

  const attention: AttentionItemDTO[] = [];
  const clubSummaries: CityManagerClubSummaryDTO[] = [];

  for (const club of clubs) {
    const clubEmployees = employeesByClub.get(club.id) ?? [];
    const pending = clubEmployees.filter((e) => e.accessStatus === "PENDING_APPROVAL");
    const managerGrant = clubManagerGrants.find((g) => g.clubId === club.id);

    if (!managerGrant) {
      attention.push({ category: "CLUB_WITHOUT_CLUB_MANAGER", entityType: "club", entityId: club.id, entityName: club.name, cityId: club.cityId, clubId: club.id });
    }
    for (const e of pending) {
      attention.push({ category: "PENDING_EMPLOYEE_APPROVAL", entityType: "employee", entityId: e.userId, entityName: e.displayName, cityId: club.cityId, clubId: e.clubId });
    }

    let trainingCompletionPercent: number | null = null;
    if (totalPublishedLessons > 0 && clubEmployees.length > 0) {
      const sum = clubEmployees.reduce((acc, e) => acc + ((completedByUser.get(e.userId) ?? 0) / totalPublishedLessons) * 100, 0);
      trainingCompletionPercent = Math.round((sum / clubEmployees.length) * 10) / 10;
    }

    clubSummaries.push({
      clubId: club.id,
      clubName: club.name,
      cityId: club.cityId,
      cityName: club.cityName,
      employeeCount: clubEmployees.length,
      activeClubManager: managerGrant ? { userId: managerGrant.userId, displayName: cmDisplayName.get(managerGrant.userId) ?? "—" } : null,
      pendingApprovalCount: pending.length,
      attentionCount: (managerGrant ? 0 : 1) + pending.length,
      trainingCompletionPercent,
    });
  }

  const clubManagers: ClubManagerAssignmentDTO[] = clubManagerGrants.map((g) => ({
    assignmentId: g.id,
    userId: g.userId,
    displayName: cmDisplayName.get(g.userId) ?? "—",
    clubId: g.clubId!,
    clubName: clubNameById.get(g.clubId!) ?? "—",
    startedAt: g.startedAt.toISOString(),
    status: "ACTIVE",
  }));

  return {
    summary: {
      clubCount: clubs.length,
      employeeCount: employees.length,
      clubManagerCount: clubManagerGrants.length,
      pendingApprovalCount: employees.filter((e) => e.accessStatus === "PENDING_APPROVAL").length,
    },
    training,
    attention,
    clubs: clubSummaries,
    clubManagers,
  };
}

/* ------------------------------ CLUB_MANAGER -------------------------------- */

export interface ClubManagerCabinetAccess {
  clubId: string;
  clubName: string | null;
  /** Who the Daily Plan / any future per-manager read should render as —
   * the synthetic persona while genuinely previewing as CLUB_MANAGER,
   * otherwise the real actor. Never an authorization identity — see
   * effective-context.ts's own invariant. */
  effectiveUser: CurrentUser;
  isPreviewing: boolean;
}

/**
 * The one place both club-manager cabinet routes (dashboard + team) resolve
 * "which club, and as whom" — three tiers, in priority order, mirroring
 * control/team's already-established pattern (Sprint 1 / Phase 2B):
 *
 * 1. An ACTIVE View-As CLUB_MANAGER preview — always that exact club,
 *    `clubId` query param ignored. Deliberately CLUB_MANAGER-only, not
 *    MANAGER: a CITY_MANAGER previewing "as MANAGER" must not gain
 *    management-dashboard data (Sprint: role-cabinets, step 4, section 13/
 *    22) — that preview only unlocks the Mini-App employee experience
 *    (Phase 2D), never this cabinet. effectiveUser here is the synthetic
 *    persona (resolveEffectiveReadContext) — real actor/authorization
 *    untouched, exactly like every other View As read path.
 * 2. The real actor's own active CLUB_MANAGER grant for the requested
 *    clubId — effectiveUser is the REAL user (no preview involved).
 * 3. The real actor's `club.read` authority for the requested clubId
 *    (CITY_MANAGER in scope, OPERATIONS_DIRECTOR, PROJECT_ADMIN) — a
 *    drill-down read, same authority control/team already grants for its
 *    RBAC path. effectiveUser is the REAL user.
 *
 * Returns null (never throws) when none of the three apply — callers turn
 * that into a 403; a missing/malformed clubId query param is the caller's
 * own 400, checked before this is even called.
 */
export async function resolveClubManagerCabinetAccess(
  user: CurrentUser,
  requestedClubId: string | null,
): Promise<ClubManagerCabinetAccess | null> {
  const effective = await resolveEffectiveReadContext(user);
  if (effective.isPreviewing && effective.viewContext!.previewRole === "CLUB_MANAGER" && effective.viewContext!.previewClubId) {
    const clubId = effective.viewContext!.previewClubId;
    return { clubId, clubName: getClubById(clubId)?.name ?? null, effectiveUser: effective.effectiveUser, isPreviewing: true };
  }

  if (!requestedClubId) return null;
  const actor = await getActorContext(user);

  const ownsClubManagerGrant = actor.grants.some(
    (g) => g.role === "CLUB_MANAGER" && g.status === "ACTIVE" && g.clubId === requestedClubId,
  );
  if (ownsClubManagerGrant) {
    return { clubId: requestedClubId, clubName: getClubById(requestedClubId)?.name ?? null, effectiveUser: user, isPreviewing: false };
  }

  const targetClubCityId = await cityIdForClub(requestedClubId);
  if (authorize(actor, { action: "club.read", targetClubId: requestedClubId, targetClubCityId })) {
    return { clubId: requestedClubId, clubName: getClubById(requestedClubId)?.name ?? null, effectiveUser: user, isPreviewing: false };
  }
  return null;
}

/**
 * `effectiveUser`/`isPreviewing` mirror home.ts's getHomeDashboardFor exactly
 * — the acting manager's OWN Daily Plan is read through the existing,
 * unmodified getPlanTodayFor (never re-implemented here), which already
 * knows not to materialize tasks for a synthetic View-As persona.
 */
export async function getClubManagerDashboard(
  clubId: string,
  clubName: string | null,
  effectiveUser: CurrentUser,
  isPreviewing: boolean,
): Promise<ClubManagerDashboardDTO> {
  const employees = await loadEmployees([clubId]);
  const pending = employees.filter((e) => e.accessStatus === "PENDING_APPROVAL");

  const { totalPublishedLessons, completedByUser } = await loadTrainingRaw(employees.map((e) => e.userId));
  const training = summarizeClubTraining(
    employees.map((e) => e.userId),
    totalPublishedLessons,
    completedByUser,
  );

  const attention: AttentionItemDTO[] = pending.map((e) => ({
    category: "PENDING_EMPLOYEE_APPROVAL",
    entityType: "employee",
    entityId: e.userId,
    entityName: e.displayName,
    cityId: null,
    clubId,
  }));

  const plan = await getPlanTodayFor(effectiveUser, isPreviewing);

  return {
    clubId,
    clubName,
    summary: { employeeCount: employees.length, pendingApprovalCount: pending.length },
    training,
    attention,
    plan,
  };
}

/** Batched "latest QuizAttempt per user" for a bounded (club-sized) set of
 * users — Prisma has no groupBy-with-max-row primitive, so this fetches every
 * attempt for the given users ordered by startedAt desc in ONE query and
 * keeps only the first (= latest) row seen per user in JS. Fine for a single
 * club's roster; NOT used at network/city scale (see the header comment). */
type LatestQuizResult = { scorePercent: number; passed: boolean; completedAt: string | null };

/** Optional, same resilience treatment as loadTrainingRaw above — a
 * QuizAttempt query failure degrades every team member's latestTestResult to
 * null (honest "unknown"), never 500s the whole roster. */
async function loadLatestQuizResults(userIds: string[]): Promise<Map<string, LatestQuizResult>> {
  if (userIds.length === 0) return new Map();
  return settleWidget(
    "cabinet_latest_quiz",
    async () => {
      const attempts = await prisma.quizAttempt.findMany({
        where: { userId: { in: userIds } },
        orderBy: { startedAt: "desc" },
        select: { userId: true, scorePercent: true, passed: true, completedAt: true },
      });
      const latest = new Map<string, LatestQuizResult>();
      for (const a of attempts) {
        if (latest.has(a.userId)) continue; // already-seen = a later attempt (desc order)
        latest.set(a.userId, { scorePercent: a.scorePercent, passed: a.passed, completedAt: a.completedAt?.toISOString() ?? null });
      }
      return latest;
    },
    new Map<string, LatestQuizResult>(),
  );
}

export async function getClubManagerTeam(clubId: string, clubName: string | null): Promise<ClubManagerTeamDTO> {
  const employees = await loadEmployees([clubId]);
  const userIds = employees.map((e) => e.userId);
  const [{ totalPublishedLessons, completedByUser }, latestResults] = await Promise.all([
    loadTrainingRaw(userIds),
    loadLatestQuizResults(userIds),
  ]);

  const members: CabinetTeamMemberDTO[] = employees.map((e) => ({
    userId: e.userId,
    displayName: e.displayName,
    position: getPositionById(e.positionId)?.title ?? null,
    accessStatus: e.accessStatus,
    onboardingCompleted: e.onboardingCompleted,
    academy: {
      progressPercent: totalPublishedLessons > 0 ? Math.round(((completedByUser.get(e.userId) ?? 0) / totalPublishedLessons) * 1000) / 10 : null,
      latestTestResult: latestResults.get(e.userId) ?? null,
    },
  }));

  return { clubId, clubName, members };
}
