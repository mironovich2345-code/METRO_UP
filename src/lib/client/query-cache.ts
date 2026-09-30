"use client";

import useSWR, { mutate as globalMutate, type SWRConfiguration } from "swr";
import { cacheKeyPrefixes } from "./cache-keys";

/**
 * Sprint: mini-app-performance — the whole client-side caching layer, built
 * on `swr` (Vercel, ~5KB gzip, two tiny transitive deps — dequal/
 * use-sync-external-store — chosen over hand-rolling the same
 * dedup/race-condition/revalidate-on-focus machinery, which is exactly the
 * kind of code that is easy to get subtly wrong; see the performance
 * report's "Client caching" section for the full justification). This file
 * is the ONLY place that imports `swr` directly — every screen goes through
 * `useQuery` below, never `useSWR` itself, so the cache's safety rules
 * (module doc in cache-keys.ts) live in one place.
 *
 * TTL POLICY (section 6) — expressed as SWR's `dedupingInterval` (the window
 * in which a second request for the SAME key is served from the in-flight/
 * just-completed one instead of firing again). This IS the actual mechanism
 * behind "stale-while-revalidate": SWR always returns cached `data`
 * synchronously on mount and revalidates in the background by default
 * (`revalidateOnMount`), so raising `dedupingInterval` does not disable
 * revalidation — it only stops a *second* revalidation from firing inside
 * that window (e.g. two components asking for the same key within the same
 * screen, or a user bouncing back and forth between two tabs faster than the
 * data could plausibly have changed).
 *
 *  MUTABLE (team roster, pending approvals, role assignments, attention,
 *  daily plan): 2s. These change from another actor's action at any time
 *  (an approval, an assignment) — the window only exists to collapse a
 *  single screen's own parallel requests, never to hide a real change.
 *
 *  MEDIUM (profile, ranking, personal Academy progress): 15s. Changes from
 *  the user's own actions (completing a lesson, a monthly rating publish) —
 *  not expected to change from someone else's action while this screen is
 *  open, so a slightly longer window is safe and cuts real request volume.
 *
 *  LONG (published Academy day/lesson structure — content, not progress):
 *  60s. Authored content that changes only via a deliberate CMS publish
 *  action, rarely, by a different actor entirely.
 */
export const QUERY_POLICY = {
  MUTABLE: { dedupingInterval: 2_000 } satisfies SWRConfiguration,
  MEDIUM: { dedupingInterval: 15_000 } satisfies SWRConfiguration,
  LONG: { dedupingInterval: 60_000 } satisfies SWRConfiguration,
} as const;

/**
 * Thin wrapper over `useSWR` — every screen's fetcher is the SAME function
 * it already called inside its old `useEffect` (cabinetApi.X / fetchY), so
 * migrating a screen is a mechanical swap, not a rewrite. `key: null` (React
 * Query/SWR's own convention) skips fetching entirely — used exactly like
 * the old `if (!x) return;` guards screens already had.
 */
export function useQuery<T>(key: string | null, fetcher: () => Promise<T>, policy: SWRConfiguration = QUERY_POLICY.MEDIUM) {
  return useSWR<T>(key, key === null ? null : fetcher, {
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
    shouldRetryOnError: false, // screens already own their own explicit "Повторить" retry button
    ...policy,
  });
}

/** Force-refresh one exact key (e.g. right after a mutation this screen
 * itself just performed) — same cache, no network round trip skipped. */
export function invalidate(key: string) {
  return globalMutate(key);
}

/** Refresh every cached key under a category prefix (e.g. every `city:*`
 * entry after a role assignment changes a club's manager) — a coarse,
 * deliberately generous invalidation is safer than hand-listing every
 * affected key and risking missing one (section 7: "do not let stale UI
 * persist"). Matched by plain string prefix, never a regex over
 * server-controlled data. */
export function invalidatePrefix(prefix: string) {
  return globalMutate((key) => typeof key === "string" && key.startsWith(prefix));
}

/**
 * Full cache flush — called on sign-out and on every View-As start/end
 * (section 17: a preview ending must never leave a previewed response
 * reachable, and a signed-out session must never leave anything for a
 * hypothetical next session in the same tab to inherit). Cheap: at most a
 * handful of entries exist for one real screen session.
 */
export function clearAllQueries() {
  return globalMutate(() => true, undefined, { revalidate: false });
}

export { cacheKeyPrefixes };
