import "server-only";
import { cookies } from "next/headers";
import { prisma } from "../db";
import { getServerEnv, isProduction } from "../env";
import { AuthError } from "../authz";
import { canUseViewAs } from "../access-status-logic";
import type { CurrentUser } from "../session";
import {
  VIEW_AS_COOKIE,
  buildViewAsCookieOptions,
  signViewAsToken,
  verifyViewAsToken,
  type ViewAsRole,
  type ViewAsPosition,
} from "../view-as-token";
import { getActorContext, cityIdForClub } from "./context";
import { canStartViewAs, type ViewAsTarget } from "./authorize-core";

/**
 * View As service (Sprint 1 / Phase 2B, sections 12-16). REAL identity
 * (getCurrentUser()/getActorContext()) is NEVER modified by any function
 * here — there is no UPDATE User.role or UPDATE RoleAssignment anywhere in
 * this file. This only issues/reads a separate, short-lived, signed cookie
 * that callers may optionally consult for an "effective read context"; it
 * grants nothing by itself; every consumer re-derives authorization from the
 * REAL actor via getActorContext(), exactly like every other route.
 */

export interface ViewContext {
  realUserId: string;
  previewRole: ViewAsRole;
  previewClubId: string | null;
  previewCityId: string | null;
  /** Sprint 1 / Phase 2D — see ViewAsPayload.previewPositionId. */
  previewPositionId: ViewAsPosition;
}

export interface StartViewAsInput {
  role: ViewAsRole;
  clubId?: string | null;
  cityId?: string | null;
  /** Required for role="MANAGER" (enforced by startViewAsSchema before this
   * is ever called); ignored otherwise (defaulted below). */
  previewPositionId?: ViewAsPosition | null;
  reason?: string | null;
}

/** CLUB_MANAGER/CITY_MANAGER previews don't gate content by position — a
 * fixed, non-Scripts-eligible default keeps the persona object well-formed
 * without implying any actual sales-script access for those roles. */
const DEFAULT_PREVIEW_POSITION: ViewAsPosition = "ADMINISTRATOR";

export async function startViewAs(realUser: CurrentUser, input: StartViewAsInput): Promise<ViewContext> {
  // Sprint 1 / Phase 2D, section 9 — the REAL actor's own accessStatus must
  // be FULL to start a preview, exactly like starting any other FULL-gated
  // action. Network-tier roles (CITY_MANAGER via RoleAssignment) commonly
  // have no EmployeeProfile at all (they're not floor employees) — that's
  // not a restriction, so only a PRESENT, non-FULL profile blocks this.
  // canUseViewAs is the single shared predicate — resolveViewContext below
  // re-runs the identical check on every subsequent read (Sprint:
  // REMEDIATION R2, F-07) so starting and continuing a preview can never
  // disagree about what status permits it.
  if (!canUseViewAs(realUser.employeeProfile?.accessStatus)) {
    throw new AuthError(403, "ACCESS_LIMITED", "Просмотр недоступен при вашем текущем статусе доступа");
  }

  const actor = await getActorContext(realUser);
  const clubId = input.clubId ?? null;
  const cityId = input.cityId ?? null;
  const previewPositionId: ViewAsPosition =
    input.role === "MANAGER" ? (input.previewPositionId ?? DEFAULT_PREVIEW_POSITION) : DEFAULT_PREVIEW_POSITION;

  let targetClubCityId: string | null = null;
  if (clubId) {
    targetClubCityId = await cityIdForClub(clubId);
    if (!targetClubCityId) throw new AuthError(404, "club_not_found");
  }

  const target: ViewAsTarget = { role: input.role, clubId, cityId };
  if (!canStartViewAs(actor, target, { targetClubCityId })) {
    throw new AuthError(403, "forbidden", "Просмотр в этой роли/зоне недоступен");
  }

  const token = await signViewAsToken(
    { realUserId: realUser.id, role: input.role, clubId, cityId, previewPositionId },
    getServerEnv().AUTH_SECRET,
  );
  const store = await cookies();
  store.set(VIEW_AS_COOKIE, token, buildViewAsCookieOptions(isProduction()));

  // targetUserId = actorUserId by design (Sprint 1 plan, "View-as audit
  // detail") — this is a self-directed preview, not an action against
  // another user's record; UserAuditLog.targetUserId stays required.
  await prisma.userAuditLog.create({
    data: {
      actorUserId: realUser.id,
      targetUserId: realUser.id,
      action: "VIEW_AS_STARTED",
      clubId,
      cityId,
      reason: input.reason ?? null,
      metadata: { previewRole: input.role, previewClubId: clubId, previewCityId: cityId, previewPositionId },
    },
  });

  return { realUserId: realUser.id, previewRole: input.role, previewClubId: clubId, previewCityId: cityId, previewPositionId };
}

export async function endViewAs(realUser: CurrentUser): Promise<void> {
  const store = await cookies();
  const existing = await verifyViewAsToken(store.get(VIEW_AS_COOKIE)?.value, getServerEnv().AUTH_SECRET);
  store.delete(VIEW_AS_COOKIE);
  if (!existing || existing.realUserId !== realUser.id) return; // nothing active for this session
  await prisma.userAuditLog.create({
    data: {
      actorUserId: realUser.id,
      targetUserId: realUser.id,
      action: "VIEW_AS_ENDED",
      clubId: existing.clubId,
      cityId: existing.cityId,
      metadata: { previewRole: existing.role, previewClubId: existing.clubId, previewCityId: existing.cityId },
    },
  });
}

/**
 * Read the active View As context for the REAL session user, or null. Every
 * call RE-VALIDATES scope against the actor's CURRENT grants (canStartViewAs
 * again) — never trusts that a grant valid when the token was issued is still
 * valid now (it may have been revoked mid-preview by a PROJECT_ADMIN). A
 * token that doesn't belong to this exact realUserId (cookie survived a
 * logout/login as someone else in the same browser) is never honored.
 *
 * Sprint: REMEDIATION R2, F-07 — every call also RE-VALIDATES the real
 * actor's own accessStatus (canUseViewAs, shared with startViewAs below),
 * not just role/scope. Without this, a preview begun while FULL stayed
 * live for the rest of the cookie's TTL straight through a mid-preview
 * transition to SUSPENDED/PENDING_APPROVAL/LIMITED — canStartViewAs alone
 * never looks at accessStatus at all, so a suspended actor could keep
 * reading as their previewed persona until the cookie simply expired.
 * realUser is re-fetched fresh from the DB on every request
 * (getCurrentUser()), so this check reflects the actor's CURRENT status,
 * not a stale snapshot from when the preview started.
 */
export async function resolveViewContext(realUser: CurrentUser): Promise<ViewContext | null> {
  const store = await cookies();
  const payload = await verifyViewAsToken(store.get(VIEW_AS_COOKIE)?.value, getServerEnv().AUTH_SECRET);
  if (!payload) return null;
  if (payload.realUserId !== realUser.id) return null;
  if (!canUseViewAs(realUser.employeeProfile?.accessStatus)) return null;

  const actor = await getActorContext(realUser);
  let targetClubCityId: string | null = null;
  if (payload.clubId) targetClubCityId = await cityIdForClub(payload.clubId);
  const stillValid = canStartViewAs(
    actor,
    { role: payload.role, clubId: payload.clubId, cityId: payload.cityId },
    { targetClubCityId },
  );
  if (!stillValid) return null;

  return {
    realUserId: realUser.id,
    previewRole: payload.role,
    previewClubId: payload.clubId,
    previewCityId: payload.cityId,
    previewPositionId: payload.previewPositionId,
  };
}

/**
 * Mutation guard — Phase 2C's src/middleware.ts is now the PRIMARY enforcement
 * point (every POST/PUT/PATCH/DELETE under /api/**, whole app, not just the
 * routes below). This function's remaining callers (control/roles' create/
 * revoke/restore, wired in Phase 2B) are redundant defense-in-depth after
 * that — kept because removing a passing safety check for no functional
 * gain is not a good trade, not because it's still load-bearing. New routes
 * should rely on the middleware and do NOT need to call this individually.
 *
 * Sprint: manual-test-round-2, section 1 (P0 root cause) — a CITY_MANAGER's
 * own SELF-preview (previewRole:"CITY_MANAGER", the existing "jump back to
 * top-level view" affordance) is exempted. It is not persona substitution at
 * all: effective-context.ts's own isPersonaPreview() already excludes it
 * (isPreviewing stays false for reads), so this real actor is still fully
 * themselves, acting with their own real, freshly-re-derived grants — never
 * a lower-privilege stand-in. Blocking their writes here served no
 * protective purpose, only created a silent trap: start "Просмотреть как →
 * Ст. города" (or leave an earlier preview's cookie live, up to its 30-minute
 * TTL) and every subsequent role.assign/revoke/restore call 403'd with no
 * indication why. A genuine MANAGER/CLUB_MANAGER preview (real persona
 * substitution) remains fully blocked, unchanged — RBAC itself
 * (canAssignRole/canRevokeRole, re-derived fresh from the DB on every call)
 * is completely untouched by this; this only removes an over-broad coarse
 * guard for the one case that was never actual impersonation.
 */
export async function requireNoActiveViewAs(realUser: CurrentUser): Promise<void> {
  const ctx = await resolveViewContext(realUser);
  if (ctx && ctx.previewRole !== "CITY_MANAGER") {
    throw new AuthError(403, "VIEW_AS_READ_ONLY", "Действие недоступно в режиме просмотра");
  }
}
