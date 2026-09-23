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
