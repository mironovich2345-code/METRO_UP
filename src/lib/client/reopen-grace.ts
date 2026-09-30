"use client";

/**
 * Sprint: mini-app-persistent-cache, section 8 — "Then silently revalidate.
 * No yellow RevalidatingBar" on a cold reopen, specifically. A brief,
 * bounded window right after the persistent cache finishes hydrating
 * (PersistentCacheProvider calls markAppOpened() once) during which
 * useQuery hides `isValidating` from every screen's UI — the background
 * refetch SWR triggers on mount still runs exactly as normal underneath
 * (data still updates the moment it arrives), only the RevalidatingBar's
 * visibility is suppressed. Outside this window (later, in-session
 * navigation/focus revalidation), the bar behaves exactly as before.
 */
const GRACE_MS = 4_000;
let openedAt = 0;

export function markAppOpened() {
  openedAt = Date.now();
}

export function isWithinReopenGrace(): boolean {
  return openedAt > 0 && Date.now() - openedAt < GRACE_MS;
}
