"use client";

import { preload } from "swr";
import { cacheKeys } from "./cache-keys";
import { fetchAcademyOverview } from "@/lib/api/content-client";
import { fetchRatingBoard, fetchProfileManagementRoles } from "@/lib/api/home-client";
import { cabinetApi } from "@/lib/api/cabinet-client";

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

export function prefetchPersonalDestinations() {
  if (!shouldPrefetch()) return;
  preload(cacheKeys.academyOverview("default"), () => fetchAcademyOverview());
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
