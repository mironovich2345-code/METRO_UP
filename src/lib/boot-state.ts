/**
 * Pure boot-state helpers (no React / server-only import → unit testable). These
 * encode the two decisions behind the P0 black-screen fix so they can be tested
 * deterministically and reused by the UI.
 */

/** The employee app's bootstrap phase, derived from the app-provider flags. */
export type BootPhase = "error" | "loading" | "ready";

/**
 * `error`   → auth/bootstrap failed (show a recoverable retry screen);
 * `loading` → bootstrap not resolved yet (show a real loader, never a blank div);
 * `ready`   → bootstrap decided (render the employee route; the page then handles
 *             its own onboarding/redirect logic).
 * Note: `ready` does NOT require a profile — an authenticated user with no profile
 * must still reach onboarding, so profile-presence is intentionally not gated here.
 */
export function bootPhase(s: { bootstrapError: boolean; hydrated: boolean }): BootPhase {
  if (s.bootstrapError) return "error";
  if (!s.hydrated) return "loading";
  return "ready";
}

/**
 * Sprint: mini-app-cold-start — the app-user status values app-provider.tsx
 * juggles. Duplicated here (not imported from AppUserProvider.tsx, a
 * "use client" React file) so this stays a plain, DOM/React-free module.
 */
export type AppUserStatusLike = "loading" | "cached" | "authenticated" | "anonymous" | "demo" | "error";

export interface IdentityPhase {
  /** True once a routing/rendering decision can be made — a cached
   * (unconfirmed) identity snapshot satisfies this exactly as well as a
   * real one; every consumer (bootPhase, the onboarding redirects in
   * /, /home, /profile) is already self-correcting once confirmation lands. */
  hydrated: boolean;
  /** True once the REAL server session has confirmed identity/access. The
   * stricter signal for anything that must never render off a guess
   * (Home's CITY_MANAGER/CLUB_MANAGER branches). */
  identityConfirmed: boolean;
  /** True while showing a merely-cached, speculative identity (status
   * "cached" specifically — distinct from "loading", which has nothing to
   * show at all yet). */
  hasCachedIdentity: boolean;
}

/**
 * Sprint: mini-app-cold-start, sections 6/7/8/13 — the ONE rule behind the
 * whole "fast shell + safe early render" design. Pulled out of
 * app-provider.tsx (a "use client" file this repo's test harness can't
 * exercise without a DOM) so the actual decision has real, deterministic
 * test coverage. `identityConfirmed` and `hasCachedIdentity` are mutually
 * exclusive by construction (derived from the same single status value).
 */
export function resolveIdentityPhase(s: { appUserStatus: AppUserStatusLike; localReady: boolean }): IdentityPhase {
  const identityConfirmed =
    s.appUserStatus === "authenticated" ||
    s.appUserStatus === "anonymous" ||
    s.appUserStatus === "demo";
  const hasCachedIdentity = s.appUserStatus === "cached";
  return {
    identityConfirmed,
    hasCachedIdentity,
    hydrated: s.localReady && (identityConfirmed || hasCachedIdentity),
  };
}

/** Where onboarding must be persisted, given the runtime + auth state. */
export type OnboardingTarget = "server" | "local" | "blocked";

/**
 * Inside real Telegram the server EmployeeProfile is the ONLY source of truth
 * (localStorage is ignored), so:
 *   - Telegram + authenticated → "server" (POST /api/profile/onboarding);
 *   - Telegram + NOT authenticated → "blocked" (do NOT write an ignored local
 *     profile and do NOT navigate to a route that can never obtain a profile —
 *     keep the draft and surface a retry);
 *   - outside Telegram (web/demo) → "local" (unchanged demo behaviour).
 */
export function onboardingPersistTarget(s: { isInsideTelegram: boolean; isAuthenticated: boolean }): OnboardingTarget {
  if (s.isInsideTelegram) return s.isAuthenticated ? "server" : "blocked";
  return "local";
}
