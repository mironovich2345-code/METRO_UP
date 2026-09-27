import type { AttentionItemDTO, CityManagerClubSummaryDTO } from "@/lib/api/cabinet-types";
import type { HomeContextDTO } from "@/lib/api/home-types";

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
