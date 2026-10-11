"use client";

import { preload } from "swr";
import { cacheKeys } from "./cache-keys";
import { fetchAcademyOverview } from "@/lib/api/content-client";
import { fetchRatingBoard, fetchProfileManagementRoles } from "@/lib/api/home-client";
import { cabinetApi } from "@/lib/api/cabinet-client";
import { loadStoredContext } from "@/lib/home-context-storage";
import { resolveInitialAcademySectionKey } from "@/lib/cabinet-ui";
import type { AcademyTargetRoleDTO } from "@/lib/api/content-types";

/**
 * Sprint: mini-app-performance, section 8 — warm the cache for the screens a
 * user is statistically likely to open next, right after Home's own data has
 * already arrived. `preload` (swr) populates the SAME cache `useQuery` reads
 * from, deduped against an in-flight or already-fresh entry automatically —
 * calling this twice, or right before the destination screen's own
 * `useQuery` fires for real, never doubles the request.
 *
 * Deliberately small and fixed — never a request storm, never large
 * datasets: at most 2-3 requests, only the ones this same real actor is
 * about to be authorized for anyway (every one of these still re-runs its
 * own full server-side auth/scope check when it actually executes — preload
 * decides WHEN to ask, never WHETHER the answer is trusted).
 */
/** Section 8 — "when network/device state permits": skip on an explicit
 * data-saver preference or a connection self-reporting as 2G-class. Neither
 * signal is available on iOS Safari/Telegram's WKWebView (feature-detected,
 * never assumed) — prefetching proceeds there, same as today's baseline. */
function shouldPrefetch(): boolean {
  const conn = (navigator as { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  if (!conn) return true;
  if (conn.saveData) return false;
  return conn.effectiveType !== "slow-2g" && conn.effectiveType !== "2g";
}

/**
 * `storedContextOwnerKey` — the SAME owner key /academy itself reads the
 * stored Home context with (home/page.tsx and academy/page.tsx both derive
 * it from useApp().telegramUser), passed in rather than re-derived here so
 * the two can never read different storage slots.
 */
export function prefetchPersonalDestinations(storedContextOwnerKey: string) {
  if (!shouldPrefetch()) return;
  // Sprint: LIVE QA FIX QA-01B — warm the EXACT key (and request the exact
  // section) /academy's own first render asks for. This used to always warm
  // "default", while /academy derives its key from the stored Home context
  // (a MANAGER's stored PERSONAL -> "MANAGER"): two keys for one response,
  // so this prefetch was never read and /academy cold-loaded right after
  // Home had warmed it. Called after Home's own saveStoredContext effect has
  // run (runWhenIdle, home/page.tsx), so it reads the same stored context
  // /academy will. resolveInitialAcademySectionKey is the one shared rule.
  const academySection = resolveInitialAcademySectionKey(loadStoredContext(storedContextOwnerKey));
  const requestedSection = academySection !== "default" ? (academySection as AcademyTargetRoleDTO) : undefined;
  preload(cacheKeys.academyOverview(academySection), () => fetchAcademyOverview(requestedSection));
  preload(cacheKeys.ratingBoard(), fetchRatingBoard);
  preload(cacheKeys.profileManagementRoles(), () => fetchProfileManagementRoles().then((r) => r.roles));
}

export function prefetchCityManagerDestinations() {
  if (!shouldPrefetch()) return;
  // Same cache key /city and /city/managers both read — warms both at once.
  preload(cacheKeys.cityDashboard(), cabinetApi.cityManager);
  preload(cacheKeys.cityTraining(), () => cabinetApi.cityManagerTraining().then((r) => r.clubs));
}

export function prefetchClubManagerDestinations() {
  if (!shouldPrefetch()) return;
  preload(cacheKeys.myManagedClubs(), () => cabinetApi.myManagedClubs().then((r) => r.clubs));
}
