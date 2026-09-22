import "server-only";
import { cookies } from "next/headers";
import { prisma } from "../db";
import { getServerEnv, isProduction } from "../env";
import { AuthError } from "../authz";
import type { CurrentUser } from "../session";
import {
  VIEW_AS_COOKIE,
  buildViewAsCookieOptions,
  signViewAsToken,
  verifyViewAsToken,
  type ViewAsRole,
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
}

export interface StartViewAsInput {
  role: ViewAsRole;
  clubId?: string | null;
  cityId?: string | null;
  reason?: string | null;
}

export async function startViewAs(realUser: CurrentUser, input: StartViewAsInput): Promise<ViewContext> {
  const actor = await getActorContext(realUser);
  const clubId = input.clubId ?? null;
  const cityId = input.cityId ?? null;

  let targetClubCityId: string | null = null;
  if (clubId) {
    targetClubCityId = await cityIdForClub(clubId);
    if (!targetClubCityId) throw new AuthError(404, "club_not_found");
  }

  const target: ViewAsTarget = { role: input.role, clubId, cityId };
  if (!canStartViewAs(actor, target, { targetClubCityId })) {
    throw new AuthError(403, "forbidden", "Просмотр в этой роли/зоне недоступен");
  }

  const token = await signViewAsToken({ realUserId: realUser.id, role: input.role, clubId, cityId }, getServerEnv().AUTH_SECRET);
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
      metadata: { previewRole: input.role, previewClubId: clubId, previewCityId: cityId },
    },
  });

  return { realUserId: realUser.id, previewRole: input.role, previewClubId: clubId, previewCityId: cityId };
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
 */
export async function resolveViewContext(realUser: CurrentUser): Promise<ViewContext | null> {
  const store = await cookies();
  const payload = await verifyViewAsToken(store.get(VIEW_AS_COOKIE)?.value, getServerEnv().AUTH_SECRET);
  if (!payload) return null;
  if (payload.realUserId !== realUser.id) return null;

  const actor = await getActorContext(realUser);
  let targetClubCityId: string | null = null;
  if (payload.clubId) targetClubCityId = await cityIdForClub(payload.clubId);
  const stillValid = canStartViewAs(
    actor,
    { role: payload.role, clubId: payload.clubId, cityId: payload.cityId },
    { targetClubCityId },
  );
  if (!stillValid) return null;

  return { realUserId: realUser.id, previewRole: payload.role, previewClubId: payload.clubId, previewCityId: payload.cityId };
}

/**
 * Mutation guard — Phase 2C's src/middleware.ts is now the PRIMARY enforcement
 * point (every POST/PUT/PATCH/DELETE under /api/**, whole app, not just the
 * routes below). This function's remaining callers (control/roles' create/
 * revoke/restore, wired in Phase 2B) are redundant defense-in-depth after
 * that — kept because removing a passing safety check for no functional
 * gain is not a good trade, not because it's still load-bearing. New routes
 * should rely on the middleware and do NOT need to call this individually.
 */
export async function requireNoActiveViewAs(realUser: CurrentUser): Promise<void> {
  const ctx = await resolveViewContext(realUser);
  if (ctx) throw new AuthError(403, "VIEW_AS_READ_ONLY", "Действие недоступно в режиме просмотра");
}
