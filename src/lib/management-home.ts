import type {
  CityManagerHomeBlockDTO,
  ClubManagerHomeBlockDTO,
  DailyTaskDTO,
  HomeAttentionItemDTO,
} from "@/lib/api/home-types";

/**
 * Sprint: LIVE QA QA-03 — "Management Dashboard Visual Polish". Pure
 * presentation derivations for the CLUB_MANAGER / CITY_MANAGER Home
 * dashboards (no React, no fetch — directly unit-tested in
 * tests/management-dashboard.test.ts).
 *
 * The one rule every function here follows: it only REARRANGES values the
 * /api/home DTO already carries. Nothing computes a new metric, and nothing
 * fills a gap with a placeholder number — a missing value is returned as
 * null / an explicit empty state, and the dashboard says so in words.
 */

/* ------------------------------ identity ------------------------------ */

/** The greeting line of a management Home header. A View-As persona
 * preview renders a synthetic persona ("Управляющий (просмотр)"), not a
 * person, so it gets the bare greeting — never "Добрый день, Управляющий". */
export function managementGreeting(greeting: string, firstName: string, isPersonaPreview: boolean): string {
  const name = firstName.trim();
  return isPersonaPreview || !name ? greeting : `${greeting}, ${name}`;
}

export interface ManagementIdentity {
  /** "Управляющий" / "Ст. города" — the same role labels the header used before. */
  roleLabel: string;
  greeting: string;
  /** The scope the dashboard is about, shown large: the club, or the
   * territory. null for a CITY_MANAGER scope with no clubs yet — the
   * server's label is then only a bare plural word, never a place name. */
  scopeTitle: string | null;
  /** CLUB_MANAGER only: the club's city, when the club catalog knows it. */
  scopeMeta: string | null;
}

type IdentitySource =
  | { kind: "club_manager"; block: Pick<ClubManagerHomeBlockDTO, "clubId" | "clubLabel" | "isPreviewing"> }
  | { kind: "city_manager"; block: Pick<CityManagerHomeBlockDTO, "scopeLabel" | "clubCount"> }
  | { kind: "full" | "onboarding" };

/** Who/where a management Home is about — null for every non-management
 * Home kind, whose header stays exactly as it was. */
export function managementIdentity(
  dash: IdentitySource | null | undefined,
  params: { greeting: string; firstName: string; cityNameForClub: (clubId: string) => string | null },
): ManagementIdentity | null {
  if (dash?.kind === "club_manager") {
    return {
      roleLabel: "Управляющий",
      greeting: managementGreeting(params.greeting, params.firstName, dash.block.isPreviewing),
      scopeTitle: dash.block.clubLabel,
      scopeMeta: params.cityNameForClub(dash.block.clubId),
    };
  }
  if (dash?.kind === "city_manager") {
    return {
      roleLabel: "Ст. города",
      // A CITY_MANAGER self-preview is the real actor, never a persona.
      greeting: managementGreeting(params.greeting, params.firstName, false),
      scopeTitle: dash.block.clubCount > 0 ? dash.block.scopeLabel : null,
      scopeMeta: null,
    };
  }
  return null;
}

/* -------------------------------- today -------------------------------- */

export type TodaySummary =
  | { kind: "empty" }
  | { kind: "tasks"; completed: number; total: number; ratio: number; allDone: boolean; nextTaskTitle: string | null };

/**
 * CLUB_MANAGER "Сегодня", from the EXISTING Daily Plan block only. A
 * zero-task day is its own explicit state — never "0 из 0" or an empty 0%
 * bar (the audited empty-plan rule). `nextTaskTitle` is the first still-open,
 * actionable task among the tasks the DTO carries (the server already sends
 * them highest-priority first); null when none of those is open — never a
 * guess about tasks the DTO does not include.
 */
export function summarizeToday(plan: {
  total: number;
  completed: number;
  tasks: Pick<DailyTaskDTO, "title" | "status" | "mode">[];
}): TodaySummary {
  if (plan.total <= 0) return { kind: "empty" };
  const allDone = plan.completed >= plan.total;
  const next = allDone ? undefined : plan.tasks.find((t) => t.status === "TODO" && t.mode !== "blocked");
  return {
    kind: "tasks",
    completed: plan.completed,
    total: plan.total,
    ratio: Math.min(plan.completed / plan.total, 1),
    allDone,
    nextTaskTitle: next?.title ?? null,
  };
}

/* ------------------------------ territory ------------------------------ */

export interface CityOverview {
  clubCount: number;
  employeeCount: number;
  /** null whenever the DTO has no training average — no published lessons,
   * or nobody in scope yet. A GENUINE 0% (data exists, the average really is
   * zero) stays the number 0. */
  training: { averagePercent: number; completedAll: number } | null;
}

/** The CITY_MANAGER overview — the block's own summary numbers, passed
 * through. null when the scope has no clubs at all: the dashboard then shows
 * a sentence, not "0 клубов / 0 сотрудников". */
export function cityOverview(
  block: Pick<CityManagerHomeBlockDTO, "clubCount" | "employeeCount" | "training">,
): CityOverview | null {
  if (block.clubCount <= 0) return null;
  const average = block.training?.averageProgressPercent ?? null;
  return {
    clubCount: block.clubCount,
    employeeCount: block.employeeCount,
    training:
      block.training && average !== null
        ? { averagePercent: average, completedAll: block.training.employeesCompletedAll }
        : null,
  };
}

/** Every club of a single city fits (the largest city in the network has
 * six); a wider multi-city scope shows the first six and links to /city. */
export const HOME_TERRITORY_CLUB_LIMIT = 6;

/** Home's compact territory list — the server's own club order, unchanged
 * (no re-ranking), capped for the dashboard; /city keeps the full list. */
export function territoryClubs<T>(clubs: T[], limit: number = HOME_TERRITORY_CLUB_LIMIT): { visible: T[]; hiddenCount: number } {
  return { visible: clubs.slice(0, limit), hiddenCount: Math.max(clubs.length - limit, 0) };
}

/* ------------------------------ attention ------------------------------ */

function distinct(values: string[]): string[] {
  return [...new Set(values.filter((v) => v.length > 0))];
}

/** WHERE for a CITY_MANAGER attention row: the clubs one category's items
 * belong to, in the server's own order. A CLUB_WITHOUT_CLUB_MANAGER item
 * names the club itself (entityName); a PENDING_EMPLOYEE_APPROVAL item names
 * an EMPLOYEE, so its club comes from the block's own club list by clubId
 * (an id the list doesn't know is skipped, never shown as a raw id). */
export function attentionClubNames(
  block: Pick<CityManagerHomeBlockDTO, "attention" | "clubs">,
  category: HomeAttentionItemDTO["category"],
): string[] {
  const clubNameById = new Map(block.clubs.map((c) => [c.clubId, c.clubName]));
  return distinct(
    block.attention
      .filter((a) => a.category === category)
      .map((a) =>
        category === "CLUB_WITHOUT_CLUB_MANAGER" ? a.entityName : a.clubId ? clubNameById.get(a.clubId) ?? "" : "",
      ),
  );
}

/** WHO for a CLUB_MANAGER pending-approval row: the waiting employees'
 * names, in the server's order. */
export function pendingEmployeeNames(attention: HomeAttentionItemDTO[]): string[] {
  return distinct(attention.filter((a) => a.category === "PENDING_EMPLOYEE_APPROVAL").map((a) => a.entityName));
}

/** "Полтавская, Невская" — null when there is nothing to name, so a row
 * renders no WHERE line rather than an empty one. */
export function listNames(names: string[]): string | null {
  return names.length > 0 ? names.join(", ") : null;
}
