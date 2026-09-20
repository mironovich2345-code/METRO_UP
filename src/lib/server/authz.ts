import "server-only";
import type { AppRole } from "@prisma/client";
import { getCurrentUser, type CurrentUser } from "./session";
import { isAccessSuspended, isAccessPending, hasFullAccess } from "./access-status-logic";
import { getActorContext } from "./rbac/context";
import { hasSystemAccess } from "./rbac/authorize-core";

/**
 * Server-side authorization helpers. Authorization is ALWAYS enforced on the
 * server — never trust the frontend. UI for privileged roles does not exist yet,
 * but the server model is ready.
 */

export class AuthError extends Error {
  status: number;
  code: string;
  /** Optional structured, client-safe details (e.g. publish validation errors). */
  details?: unknown;
  constructor(status: number, code: string, message?: string, details?: unknown) {
    super(message ?? code);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthError(401, "unauthorized", "Authentication required");
  return user;
}

export async function requireRole(...roles: AppRole[]): Promise<CurrentUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) {
    throw new AuthError(403, "forbidden", "Insufficient permissions");
  }
  return user;
}

export async function requireEmployeeProfile(): Promise<CurrentUser> {
  const user = await requireUser();
  if (!user.employeeProfile) {
    throw new AuthError(409, "onboarding_required", "Employee profile required");
  }
  return user;
}

/**
 * ACCESS STATUS enforcement (Sprint 1 / Phase 2A). EmployeeProfile.accessStatus
 * previously had zero server-side effect anywhere — a confirmed P1 in the
 * technical audit (LIMITED/PENDING_APPROVAL/SUSPENDED were all functionally
 * identical to FULL). These three primitives are the enforcement point; apply
 * them ONLY to employee-facing Mini App routes (home/academy/plan/knowledge/
 * metric/xp/rating/achievements) — never to /api/control/** or /api/spm/**,
 * whose CLUB_MANAGER/SPM/ADMIN actors are gated by requireRole()/AppRole and
 * typically carry no EmployeeProfile at all (accessStatus would be null for
 * them, not a business signal).
 *
 * Public contract for SUSPENDED (approved spec): NEVER HTTP 503 — that reads
 * as an infrastructure outage and pollutes monitoring/retry. A neutral
 * HTTP 403 / "APP_TEMPORARILY_UNAVAILABLE" is returned instead; the real
 * reason is known to the code path that throws it and is recorded in
 * UserAuditLog at the moment access was actually suspended (the
 * access-revoke API), never leaked to the client here. The Phase 2A scope is
 * this backend contract only — the client-side "technical issues" screen is
 * explicitly deferred.
 */

/** Blocks only SUSPENDED. PENDING_APPROVAL/LIMITED/FULL all pass — for
 * endpoints every non-suspended business user must reach regardless of
 * approval state (e.g. reading one's own profile so *some* screen can
 * render). */
export async function requireActiveAccess(): Promise<CurrentUser> {
  const user = await requireEmployeeProfile();
  if (isAccessSuspended(user.employeeProfile!.accessStatus)) {
    throw new AuthError(403, "APP_TEMPORARILY_UNAVAILABLE");
  }
  return user;
}

/** Blocks SUSPENDED and PENDING_APPROVAL. Allows LIMITED and FULL — the
 * approved LIMITED whitelist (Academy content + its required tests). Do not
 * widen this to a route outside that whitelist. */
export async function requireLimitedOrFullAccess(): Promise<CurrentUser> {
  const user = await requireEmployeeProfile();
  const status = user.employeeProfile!.accessStatus;
  if (isAccessSuspended(status)) throw new AuthError(403, "APP_TEMPORARILY_UNAVAILABLE");
  if (isAccessPending(status)) throw new AuthError(403, "ACCESS_PENDING_APPROVAL");
  return user;
}

/** Requires FULL. Blocks SUSPENDED, PENDING_APPROVAL, and LIMITED — the
 * default for anything not on the LIMITED whitelist (Daily Plan, Metric,
 * Scripts, Instructions, Ranking, XP, Achievements). */
export async function requireFullAccess(): Promise<CurrentUser> {
  const user = await requireEmployeeProfile();
  const status = user.employeeProfile!.accessStatus;
  if (isAccessSuspended(status)) throw new AuthError(403, "APP_TEMPORARILY_UNAVAILABLE");
  if (isAccessPending(status)) throw new AuthError(403, "ACCESS_PENDING_APPROVAL");
  if (!hasFullAccess(status)) throw new AuthError(403, "ACCESS_LIMITED", "Требуется полный доступ");
  return user;
}

/**
 * SYSTEM/CMS compatibility gate (Sprint 1 / Phase 2B). The ONE bridge for every
 * route that used to be requireAdmin()-only and is in scope for PROJECT_ADMIN
 * per the approved spec: Academy CMS, Scripts CMS, Instructions CMS, Metric
 * document management/sync, and control/users (role/club/position
 * management). Legacy AppRole=ADMIN OR an active PROJECT_ADMIN/SYSTEM
 * RoleAssignment — see hasSystemAccess() in rbac/authorize-core.ts, which is
 * the actual decision logic (pure, unit-tested). Do not inline
 * "legacyAdmin || projectAdmin" anywhere else — every CMS/system route calls
 * THIS function instead of requireAdmin(). requireAdmin() itself is
 * untouched and stays reserved for legacy-AppRole-only semantics (e.g. the
 * SPM bridge in requireSPMAccess, which is explicitly NOT extended to
 * PROJECT_ADMIN — SPM is a separate, do-not-touch legacy axis).
 */
export async function requireSystemAccess(): Promise<CurrentUser> {
  const user = await requireUser();
  const actor = await getActorContext(user);
  if (!hasSystemAccess(actor)) {
    throw new AuthError(403, "forbidden", "Insufficient permissions");
  }
  return user;
}

/**
 * Non-throwing sibling of requireSystemAccess() for Server Component page
 * gates (control/(portal)/{scripts,instructions,metric,metric/documents,
 * users}/page.tsx and admin/layout.tsx), which render an <AccessDenied/>
 * rather than catch a thrown AuthError. Same decision (hasSystemAccess) —
 * do not reimplement the "legacyAdmin || projectAdmin" check inline.
 */
export async function hasSystemAccessForUser(user: CurrentUser): Promise<boolean> {
  return hasSystemAccess(await getActorContext(user));
}

export const requireClubManager = () => requireRole("CLUB_MANAGER", "ADMIN");
/** Strict SPM only. Prefer requireSPMAccess() for the SPM panel/APIs. */
export const requireSPM = () => requireRole("SPM");
/** SPM panel + write actions: SPM or ADMIN (ADMIN keeps its real identity). */
export const requireSPMAccess = () => requireRole("SPM", "ADMIN");
export const requireAdmin = () => requireRole("ADMIN");
