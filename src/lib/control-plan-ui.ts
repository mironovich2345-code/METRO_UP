/**
 * Sprint: REMEDIATION R4.2, F-05 — pure render-state decision for
 * /control/plan's (and any sibling desktop manager-workspace page's) club
 * scope. No React, no fetch — kept separate specifically so this logic has
 * real, DB-free, harness-free test coverage, same convention as
 * src/lib/cabinet-ui.ts (the Mini-App's own pure render-model module).
 *
 * The product rule this encodes (brief sections 2/3/10):
 * - A resolved clubId (from the server — legacy own club, or a single
 *   active CLUB_MANAGER grant auto-resolved, or an ADMIN/manager's own
 *   explicit, already-validated selection) means the workspace is simply
 *   ACTIVE for that club. No picker, no empty-state message.
 * - ADMIN with no resolved club picks from every active club (existing,
 *   unchanged behavior) — a distinct state from the manager case below so
 *   the two option sets (admin: all clubs; manager: only their own grants)
 *   are never confused with each other in the UI layer either.
 * - A non-admin manager with no resolved club is, by construction, either
 *   fetching their own eligible clubs (loading) or has already received
 *   that list and must explicitly choose among 2+ of them (manager-
 *   select-club) or has none at all (no-club, the pre-existing "account
 *   not linked to a club" case). Exactly one eligible club is never a
 *   state this function needs to render specially — the server resolves
 *   it automatically (getManagerScope/resolveScopedClubId), so
 *   `resolvedClubId` is already non-null by the time that count matters.
 */

export type PlanScopeUiState =
  | "active"
  | "admin-select-club"
  | "loading-manager-clubs"
  | "manager-select-club"
  | "no-club";

export function resolvePlanScopeUiState(params: {
  /** plan.clubId (or scope.clubId) from the most recent server response —
   * never a raw, unvalidated client selection. */
  resolvedClubId: string | null;
  isAdmin: boolean;
  /** null = the manager's own eligible-clubs list hasn't been fetched yet
   * (or isn't relevant — admin/already-resolved). Only consulted when
   * `resolvedClubId` is null AND `isAdmin` is false. */
  managedClubsCount: number | null;
}): PlanScopeUiState {
  if (params.resolvedClubId) return "active";
  if (params.isAdmin) return "admin-select-club";
  if (params.managedClubsCount === null) return "loading-manager-clubs";
  if (params.managedClubsCount > 1) return "manager-select-club";
  return "no-club";
}
