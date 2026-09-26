import type { AttentionItemDTO, CityManagerClubSummaryDTO } from "@/lib/api/cabinet-types";

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
