/**
 * Sprint: LIVE QA QA-07 — "count navigations, not rerenders" (pure; tested).
 *
 * One guard per page lifetime remembers the last COMMITTED pathname. A visit
 * is recorded only when the pathname differs from it, so rerenders, query
 * refreshes, theme changes, React Strict Mode's double effects and provider
 * remounts (same pathname) never add an event — while Home → Academy → Home
 * is three real visits. Untracked paths still move the guard (so Home →
 * /setup → Home counts Home twice). A tracked screen whose surface is not
 * ready yet (Mini App before its session is confirmed) is NOT consumed: it
 * is recorded once readiness arrives. No time-based debounce.
 */
import { resolveScreenKey, screenSurface, type ScreenKey, type TelemetrySurfaceValue } from "@/lib/telemetry/screens";

export interface ScreenViewGuard {
  next(pathname: string | null | undefined, isReady: (surface: TelemetrySurfaceValue) => boolean): ScreenKey | null;
}

export function createScreenViewGuard(): ScreenViewGuard {
  let last: string | null = null;
  return {
    next(pathname, isReady) {
      if (!pathname) return null;
      const path = pathname.split(/[?#]/)[0];
      if (path === last) return null;
      const key = resolveScreenKey(path);
      if (!key) {
        last = path;
        return null;
      }
      if (!isReady(screenSurface(key))) return null;
      last = path;
      return key;
    },
  };
}

/** The app-wide guard (module scope → survives provider remounts). */
export const screenViewGuard = createScreenViewGuard();
