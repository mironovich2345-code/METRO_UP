import type { AccessStatus } from "@prisma/client";

/**
 * Pure accessStatus threshold predicates (no DB / server-only import, so they
 * are directly unit-testable). authz.ts composes these with the
 * session-derived profile (requireEmployeeProfile) — the server remains the
 * sole authority, never a client-sent flag.
 *
 * Approved semantics (Sprint 1 / Phase 2A):
 * - PENDING_APPROVAL: no regular working functionality at all.
 * - LIMITED: own profile / onboarding / Academy + its required tests /
 *   notifications only — everything else denied by default.
 * - FULL: everything role + scope allows.
 * - SUSPENDED: no working access, ever — server-side, not just hidden in the UI.
 */

/** SUSPENDED blocks every one of the three tiers below — checked first by
 * every caller so its neutral, non-503 error always wins over a more
 * specific "pending"/"limited" code. */
export function isAccessSuspended(status: AccessStatus | null | undefined): boolean {
  return status === "SUSPENDED";
}

export function isAccessPending(status: AccessStatus | null | undefined): boolean {
  return status === "PENDING_APPROVAL";
}

/** The approved LIMITED whitelist (Academy + required tests) — LIMITED or FULL. */
export function hasLimitedOrFullAccess(status: AccessStatus | null | undefined): boolean {
  return status === "LIMITED" || status === "FULL";
}

/** Anything not on the LIMITED whitelist (Daily Plan, Metric, Scripts,
 * Instructions, Ranking, XP, Achievements) — FULL only. */
export function hasFullAccess(status: AccessStatus | null | undefined): boolean {
  return status === "FULL";
}

/**
 * Which UserAuditLog action name a before -> after accessStatus transition
 * gets (Sprint 1 / Phase 2B section 10's approved event vocabulary):
 * SUSPENDED is always ACCESS_SUSPENDED regardless of what it came from;
 * leaving SUSPENDED for anything else is a restore; everything else (a plain
 * FULL<->LIMITED adjustment, or the very first grant) is a generic grant.
 * One function so setEmployeeAccess and approveManagerAccess (club-plan.ts)
 * never disagree on naming.
 */
export function resolveAccessAuditAction(
  before: AccessStatus | null,
  after: AccessStatus,
): "ACCESS_SUSPENDED" | "ACCESS_RESTORED" | "ACCESS_GRANTED" {
  if (after === "SUSPENDED") return "ACCESS_SUSPENDED";
  if (before === "SUSPENDED") return "ACCESS_RESTORED";
  return "ACCESS_GRANTED";
}
