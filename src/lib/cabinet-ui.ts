import type { AttentionItemDTO, CityManagerClubSummaryDTO, ManagerDelegatedTaskDTO } from "@/lib/api/cabinet-types";
import type { HomeContextDTO, HomeContextType } from "@/lib/api/home-types";
import type { AcademyTargetRoleDTO } from "@/lib/api/content-types";

/**
 * Sprint: role-cabinets, step 5 — pure render-model helpers for the
 * CITY_MANAGER cabinet UI (CityManagerCabinet.tsx / CityManagerClubDetail.tsx).
 * No React, no fetch, no DOM — kept separate specifically so this logic has
 * real, DB-free, harness-free test coverage (this repo's test runner is
 * Node's built-in `node --import tsx --test`, with no jsdom/React Testing
 * Library installed — component RENDER behavior itself cannot be
 * unit-tested here; see tests/cabinet-ui.test.ts's header comment for the
 * honest limitation this is working around).
 */

/** Russian plural form selection for a count — "1 клуб" / "2 клуба" / "5 клубов". */
export function pluralRu(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

/**
 * Management Round E1, section 6 — "Стаж" computed PURELY from a real
 * EmploymentAssignment.startedAt (the caller's job to never pass
 * User.createdAt here). `now` is an explicit parameter — defaulting to the
 * real current time at every production call site — so this stays pure and
 * directly unit-testable rather than silently depending on Date.now()
 * inside a test run. Returns a calm, correctly-pluralized Russian label:
 * under 30 days as days, under a year as months, otherwise years (+
 * remaining months when non-zero, e.g. "2 года 3 месяца").
 */
export function formatTenureRu(startedAtIso: string, now: Date = new Date()): string {
  const started = new Date(startedAtIso);
  const totalDays = Math.max(0, Math.floor((now.getTime() - started.getTime()) / 86_400_000));
  if (totalDays < 30) {
    return `${totalDays} ${pluralRu(totalDays, "день", "дня", "дней")}`;
  }
  const totalMonths = Math.floor(totalDays / 30);
  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  if (years === 0) {
    return `${months} ${pluralRu(months, "месяц", "месяца", "месяцев")}`;
  }
  const yearsLabel = `${years} ${pluralRu(years, "год", "года", "лет")}`;
  return months > 0 ? `${yearsLabel} ${months} ${pluralRu(months, "месяц", "месяца", "месяцев")}` : yearsLabel;
}

/** The distinct, non-null city names covered by a CITY_MANAGER's clubs —
 * drives the cabinet header's scope summary (section 4): handles one city,
 * several cities, and a club-only scope (empty array) uniformly, since it's
 * derived from the actual club list rather than an assumption. */
export function distinctCityNames(clubs: Pick<CityManagerClubSummaryDTO, "cityName">[]): string[] {
  return [...new Set(clubs.map((c) => c.cityName).filter((n): n is string => Boolean(n)))];
}

export function clubsWithoutManager(attention: AttentionItemDTO[]): AttentionItemDTO[] {
  return attention.filter((a) => a.category === "CLUB_WITHOUT_CLUB_MANAGER");
}

export interface PendingApprovalGroup {
  clubId: string;
  count: number;
}

/**
 * Section 6's own example text ("2 сотрудника ожидают подтверждения") is an
 * AGGREGATE, not one row per employee — the server's attention model
 * (step 4) still produces one PENDING_EMPLOYEE_APPROVAL item per employee
 * (so each carries its own entityId/entityName for a future richer view),
 * but the cabinet groups them by club here, at the presentation layer, into
 * one navigable card per club with a count. Items with no clubId (shouldn't
 * happen for this DTO, but never trusted blindly) are skipped rather than
 * crashing or silently mis-grouped under "undefined".
 */
export function groupPendingApprovalByClub(attention: AttentionItemDTO[]): PendingApprovalGroup[] {
  const byClub = new Map<string, number>();
  for (const a of attention) {
    if (a.category !== "PENDING_EMPLOYEE_APPROVAL" || !a.clubId) continue;
    byClub.set(a.clubId, (byClub.get(a.clubId) ?? 0) + 1);
  }
  return [...byClub.entries()].map(([clubId, count]) => ({ clubId, count }));
}

/** Total number of attention CARDS the section will render (not the number
 * of underlying items — several PENDING_EMPLOYEE_APPROVAL items for the
 * same club collapse into one card). Used to decide the empty state. */
export function attentionCardCount(attention: AttentionItemDTO[]): number {
  return clubsWithoutManager(attention).length + groupPendingApprovalByClub(attention).length;
}

/**
 * Section 9 — "do not silently create duplicates": a SUSPENDED/ENDED
 * assignment's restore action should be disabled whenever the club already
 * has a different ACTIVE manager, since the server would 409 that exact
 * collision anyway (role-assignment-service.ts's restoreRoleAssignment) —
 * this only decides whether to grey out the button, never bypasses the
 * server's own check.
 */
export function canRestoreAssignment(hasActiveManager: boolean): boolean {
  return !hasActiveManager;
}

/* ---------------------- CLUB_MANAGER cabinet (step 6) --------------------- */

export interface ClubRef {
  id: string;
  name: string;
  cityId: string;
  cityName: string | null;
}

export type ManagedClubSelection =
  | { kind: "none" }
  | { kind: "auto"; club: ClubRef }
  | { kind: "select"; clubs: ClubRef[] };

/**
 * Section 3 — "never silently pick an arbitrary first club": given the
 * caller's own managed-clubs list (GET /api/control/club/clubs), decide
 * whether to auto-select (exactly one), ask the user to choose (more than
 * one), or report there is nothing to manage (zero) — a pure decision
 * ClubManagerCabinet.tsx renders from, never re-implements inline.
 */
export function resolveManagedClubSelection(clubs: ClubRef[]): ManagedClubSelection {
  if (clubs.length === 0) return { kind: "none" };
  if (clubs.length === 1) return { kind: "auto", club: clubs[0] };
  return { kind: "select", clubs };
}

export interface TeamMemberLike {
  accessStatus: "LIMITED" | "PENDING_APPROVAL" | "FULL" | "SUSPENDED";
}

/** Section 6/8 — the employees this cabinet's "Требует внимания" /
 * "Новые сотрудники" sections act on. A named, tested predicate rather than
 * an inline filter repeated in two places. */
export function filterPendingEmployees<T extends TeamMemberLike>(team: T[]): T[] {
  return team.filter((m) => m.accessStatus === "PENDING_APPROVAL");
}

export type PlanWidgetState = "no-data" | "empty" | "has-tasks";

/**
 * Section 12/18 — "daily plan null does not crash": the three states
 * DailyPlanWidget renders, decided once here rather than as an inline
 * `!plan || !tasks` check the component repeats. `no-data` covers both "the
 * dashboard's plan field is null" (no acting-user context to compute it —
 * see ClubManagerDashboardDTO's own doc comment) and "tasks is null" (still
 * loading/reset); `empty` is the honest "materialized, zero tasks today"
 * case; never conflated with `no-data`.
 */
export function planWidgetState(plan: { tasks: unknown[] } | null): PlanWidgetState {
  if (!plan) return "no-data";
  return plan.tasks.length === 0 ? "empty" : "has-tasks";
}

/* ------------------ Home context switcher (mini-app-context-switcher) ------------------ */

/** The one context every eligible user always has, and the safe fallback
 * whenever a requested/persisted context can no longer be honored (sections
 * 8-9: revoked-role safety). */
export const PERSONAL_CONTEXT: HomeContextDTO = { type: "PERSONAL", label: "Личный кабинет" };

/**
 * Section 3's critical boundary, enforced as one pure, shared function: a
 * requested context (from a query param OR a client's persisted
 * localStorage value — same shape either way) is honored ONLY if it exactly
 * matches one of the CALLER-SUPPLIED `available` entries, which the server
 * always derives fresh from the real actor's CURRENT grants
 * (resolveAvailableHomeContexts). There is no path from "the client asked
 * for CITY_MANAGER" to actually rendering it other than that context already
 * being present in `available` — a MANAGER cannot fabricate one through a
 * query param or a stale/tampered localStorage value (section 16's own
 * required test). Falls back to the PERSONAL entry in `available` (or the
 * first available entry, or the bare PERSONAL_CONTEXT constant if the caller
 * has literally nothing) — never throws, never renders nothing.
 */
export function resolveActiveContext(
  requested: { type: string; clubId?: string | null } | null | undefined,
  available: HomeContextDTO[],
): HomeContextDTO {
  const fallback = available.find((c) => c.type === "PERSONAL") ?? available[0] ?? PERSONAL_CONTEXT;
  if (!requested) return fallback;
  const match = available.find(
    (c) => c.type === requested.type && (c.type !== "CLUB_MANAGER" || c.clubId === requested.clubId),
  );
  return match ?? fallback;
}

/* ----------------------- Academy role sections (manual-test-round-2) ----------------------- */

/**
 * Section 4's "unauthorized role section cannot be fabricated through URL/
 * localStorage" — the exact same pattern as resolveActiveContext above: a
 * requested section is honored ONLY if it's exactly present in the
 * CALLER-SUPPLIED `allowed` list, which the server always derives fresh from
 * the real actor's CURRENT RoleAssignment grants
 * (resolveAllowedAcademySections). Falls back to MANAGER when allowed (the
 * universal baseline tier), else the first allowed section — never throws.
 */
export function resolveActiveAcademySection(
  requested: string | null | undefined,
  allowed: AcademyTargetRoleDTO[],
): AcademyTargetRoleDTO {
  const fallback = allowed.includes("MANAGER") ? "MANAGER" : (allowed[0] ?? "MANAGER");
  if (!requested) return fallback;
  return (allowed as string[]).includes(requested) ? (requested as AcademyTargetRoleDTO) : fallback;
}

/** Section 4 — "default selected Academy section should follow the active
 * Mini App context when possible": PERSONAL has no Academy tier of its own,
 * it trains as MANAGER. */
export function homeContextToAcademySection(contextType: HomeContextType): AcademyTargetRoleDTO {
  return contextType === "PERSONAL" ? "MANAGER" : contextType;
}

/* ------------------------- /team access mode (manual-test-round-3) ------------------------- */

export interface TeamAccessMode {
  /** True only for a CITY_MANAGER's read-only drill-down (explicit ?clubId=,
   * no active preview) — hides "Подтвердить"; approval stays the real
   * CLUB_MANAGER's job. */
  isReadOnlyDrillDown: boolean;
  /** The club id every fetch on /team should key off — never `selectedClubId`
   * directly once an explicit clubId is present. */
  activeClubId: string | null;
}

/**
 * Sprint: manual-test-round-3, section 1 — the P0 fix's own decision logic,
 * extracted out of /team/page.tsx so it has real, DB-free test coverage
 * instead of being buried inline in a component (same reasoning as
 * resolveActiveContext/resolveManagedClubSelection above).
 *
 * An active View-As-CLUB_MANAGER preview always wins over any `?clubId=` in
 * the URL for the read-only DECISION (isReadOnlyDrillDown stays false while
 * previewing, matching dashboard.isPreviewing's own independent, server-side
 * guard) — a genuine drill-down is only ever a CITY_MANAGER hopping in from
 * /city/club, never a preview. `activeClubId` still threads `explicitClubId`
 * through even while previewing — harmless, since
 * resolveClubManagerCabinetAccess's tier 1 (server-side) ignores any clubId
 * whenever a preview is active and always resolves the exact previewed club
 * instead; this is not a second, weaker access check.
 */
export function resolveTeamAccessMode(params: {
  isPreviewing: boolean;
  explicitClubId: string | null;
  selectedClubId: string | null;
}): TeamAccessMode {
  const { isPreviewing, explicitClubId, selectedClubId } = params;
  return {
    isReadOnlyDrillDown: !isPreviewing && Boolean(explicitClubId),
    activeClubId: explicitClubId ?? selectedClubId,
  };
}

export type CityClubPageStatus = "loading" | "ready" | "error" | "denied";

/**
 * METRO UP ROUND 1, section 3C — /city/club's page status, now requiring an
 * EXPLICIT confirmed CITY_MANAGER grant in addition to the underlying reads
 * succeeding. Pulled out as a pure function (same reasoning as every other
 * `-core`/pure decision helper in this codebase) specifically so this fix —
 * a real CLUB_MANAGER must never see this page's management actions, even
 * though their own-club read access legitimately succeeds — has real,
 * DB-free test coverage instead of living only inline in the page component.
 *
 * `dataError`/`dataReady`/`rolesLoading`/`isCityManager` are all the
 * client already has from its two independent useQuery calls (the club's
 * own dashboard/team/manager-rows bundle, and profile/management-roles) —
 * this function makes no network call itself.
 */
export function resolveCityClubPageStatus(params: {
  isForbiddenError: boolean;
  isOtherError: boolean;
  dataReady: boolean;
  rolesLoading: boolean;
  isCityManager: boolean;
}): CityClubPageStatus {
  const { isForbiddenError, isOtherError, dataReady, rolesLoading, isCityManager } = params;
  if (isForbiddenError) return "denied";
  if (isOtherError) return "error";
  if (!dataReady || rolesLoading) return "loading";
  if (!isCityManager) return "denied";
  return "ready";
}

/* --------------------- role-assignment error messages (manual-test-round-2) --------------------- */

/**
 * Sprint: manual-test-round-2, section 1 — the P0 bug report's actual
 * complaint was as much "the UI hid the real cause" as it was the
 * VIEW_AS_READ_ONLY trap itself (see rbac/view-as.ts's requireNoActiveViewAs
 * and middleware.ts for the root-cause fix). Every RoleAssignment write path
 * (assign/revoke/restore, /team's approve) now shows a specific, actionable
 * message for every KNOWN server error code, never one blanket string — and
 * for anything unrecognized, still shows the raw code (a short, safe,
 * non-PII enum-like string, never a stack trace or DB detail) rather than
 * silently swallowing it, so a real-device tester can always report exactly
 * what happened.
 */
const ROLE_ASSIGNMENT_ERROR_MESSAGES: Record<string, string> = {
  VIEW_AS_READ_ONLY: "Действие недоступно в режиме просмотра. Завершите предпросмотр и попробуйте снова.",
  forbidden: "Недостаточно прав для этого действия.",
  club_not_found: "Клуб не найден.",
  user_not_found: "Сотрудник не найден.",
  assignment_already_active: "У клуба уже есть активный управляющий.",
  duplicate_active_assignment: "У клуба уже есть активный управляющий.",
  rate_limited: "Слишком много попыток. Попробуйте через минуту.",
  unauthorized: "Сессия истекла. Войдите заново.",
};

export function describeRoleAssignmentError(code: string | null | undefined): string {
  if (code && ROLE_ASSIGNMENT_ERROR_MESSAGES[code]) return ROLE_ASSIGNMENT_ERROR_MESSAGES[code];
  return code ? `Не удалось выполнить действие (код: ${code}).` : "Не удалось выполнить действие.";
}

/** ManagerTasksSheet's own 4-way classification result — named buckets, each a
 * fresh array (never the same array reference as `tasks`, never mutated). */
export interface DelegatedTaskGroups {
  overdue: ManagerDelegatedTaskDTO[];
  today: ManagerDelegatedTaskDTO[];
  upcoming: ManagerDelegatedTaskDTO[];
  past: ManagerDelegatedTaskDTO[];
}

/**
 * Sprint: REMEDIATION R3, F-08 — ManagerTasksSheet used to be a two-way
 * split (date === today -> "Сегодня", everything else -> "Предстоящие"),
 * so a past, still-TODO task the assigning CITY_MANAGER never came back to
 * resolve was silently mislabeled "Предстоящие" (upcoming) — it never
 * actually disappeared (getCityManagerDelegatedTasks has no date-range
 * filter at all), but it was shown as if it hadn't happened yet. Product
 * decision (final, R3 brief): a past incomplete task must remain visible,
 * labeled "Просроченные" (overdue), never silently relabeled as upcoming.
 *
 * Four buckets, decided purely from a business-day STRING comparison
 * (`date` is YYYY-MM-DD — the same app-timezone-day convention
 * DailyPlanDTO/appDay() already use everywhere else in this codebase;
 * lexical string comparison is correct for this format with zero
 * Date/timezone parsing needed, exactly like sortDelegatedTasks's own
 * date-ascending sort in city-plan-core.ts):
 *
 * - OVERDUE:  date < today AND status === "TODO"
 * - TODAY:    date === today, regardless of status
 * - UPCOMING: date > today
 * - PAST:     date < today AND status !== "TODO" (already resolved —
 *             COMPLETED or SKIPPED — just no longer the current day)
 *
 * Does not mutate `tasks`; every bucket is a fresh array built via a
 * single pass, preserving the server's own pre-sorted order
 * (sortDelegatedTasks: date-ascending, incomplete-before-done) within
 * each bucket — never a second client-side sort.
 */
export function groupDelegatedTasksByDate(tasks: ManagerDelegatedTaskDTO[], today: string): DelegatedTaskGroups {
  const overdue: ManagerDelegatedTaskDTO[] = [];
  const todayTasks: ManagerDelegatedTaskDTO[] = [];
  const upcoming: ManagerDelegatedTaskDTO[] = [];
  const past: ManagerDelegatedTaskDTO[] = [];
  for (const t of tasks) {
    if (t.date === today) {
      todayTasks.push(t);
    } else if (t.date < today) {
      if (t.status === "TODO") overdue.push(t);
      else past.push(t);
    } else {
      upcoming.push(t);
    }
  }
  return { overdue, today: todayTasks, upcoming, past };
}
