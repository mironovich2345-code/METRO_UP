"use client";

import useSWR, { mutate as globalMutate, type SWRConfiguration } from "swr";
import { cacheKeyPrefixes } from "./cache-keys";
import { deleteEntry, deleteEntriesByPrefix, clearAllEntries } from "./persistent-cache";
import { isWithinReopenGrace } from "./reopen-grace";

/**
 * Sprint: mini-app-performance / mini-app-persistent-cache — the whole
 * client-side caching layer, built on `swr` (Vercel, ~5KB gzip, two tiny
 * transitive deps — dequal/use-sync-external-store — chosen over hand-
 * rolling the same dedup/race-condition/revalidate-on-focus machinery,
 * which is exactly the kind of code that is easy to get subtly wrong; see
 * the performance report's "Client caching" section for the full
 * justification). This file is the ONLY place that imports `swr` directly —
 * every screen goes through `useQuery` below, never `useSWR` itself, so the
 * cache's safety rules (module doc in cache-keys.ts) live in one place.
 *
 * L1/L2 — SWR's own in-memory cache (L1) is now backed by a Cache provider
 * (persistent-swr-cache.ts, wired up in PersistentCacheProvider) that is
 * ALSO durable to IndexedDB (L2) for the key categories persistent-cache-
 * core.ts's policy allows. Every function below that touches the cache
 * (invalidate/invalidatePrefix/clearAllQueries) explicitly clears L2 too,
 * rather than assuming SWR's own internal cache.set/delete calls will do it
 * as a side effect — explicit is safer than inferred here.
 *
 * TTL POLICY (section 6, performance sprint) — expressed as SWR's
 * `dedupingInterval` (the window in which a second request for the SAME key
 * is served from the in-flight/just-completed one instead of firing again).
 * This IS the actual mechanism behind "stale-while-revalidate": SWR always
 * returns cached `data` synchronously on mount and revalidates in the
 * background by default (`revalidateOnMount`), so raising `dedupingInterval`
 * does not disable revalidation — it only stops a *second* revalidation
 * from firing inside that window. This is INDEPENDENT of the persisted-
 * cache TTL (persistent-cache-core.ts's PERSIST_TTL_MS, mini-app-
 * persistent-cache section 7) — dedupingInterval governs request collapsing
 * within one running session; the persisted TTL governs whether an entry
 * read back from IndexedDB on a COLD reopen is still trusted at all.
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
 *
 * Sprint: mini-app-persistent-cache, section 8 — `isValidating` is hidden
 * (forced false) for the brief window right after a cold reopen
 * (reopen-grace.ts), so RevalidatingBar never appears while a persisted
 * screen's background refresh is what's running — "silently revalidate, no
 * yellow bar" — without touching the real SWR state `data`/`mutate`/etc
 * consumers rely on for correctness.
 */
export function useQuery<T>(key: string | null, fetcher: () => Promise<T>, policy: SWRConfiguration = QUERY_POLICY.MEDIUM) {
  const swr = useSWR<T>(key, key === null ? null : fetcher, {
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
    shouldRetryOnError: false, // screens already own their own explicit "Повторить" retry button
    ...policy,
  });
  return isWithinReopenGrace() ? { ...swr, isValidating: false } : swr;
}

/** Force-refresh one exact key (e.g. right after a mutation this screen
 * itself just performed) — same cache, no network round trip skipped.
 * Clears L2 explicitly too (section 9): a stale persisted copy must never
 * survive a mutation that's about to make it wrong. */
export function invalidate(key: string) {
  deleteEntry(key);
  return globalMutate(key);
}

/** Refresh every cached key under a category prefix (e.g. every `city:*`
 * entry after a role assignment changes a club's manager) — a coarse,
 * deliberately generous invalidation is safer than hand-listing every
 * affected key and risking missing one (section 7: "do not let stale UI
 * persist"). Matched by plain string prefix, never a regex over
 * server-controlled data. Clears the matching L2 entries too. */
export function invalidatePrefix(prefix: string) {
  deleteEntriesByPrefix(prefix);
  return globalMutate((key) => typeof key === "string" && key.startsWith(prefix));
}

/**
 * Full cache flush — called on sign-out and on every View-As start/end
 * (section 17 of the performance sprint; section 10/12 here: a preview
 * ending must never leave a previewed response reachable, and a signed-out
 * session must never leave anything for a hypothetical next session in the
 * same tab to inherit). Clears L2 in full too — not just this owner's rows,
 * since PersistentCacheProvider separately handles a genuine owner-change
 * via deleteAllForOwner before re-hydrating for the new owner; this
 * function's job is "nothing from the CURRENT session should survive it,"
 * which a full clear satisfies unconditionally and cheaply (at most a
 * couple hundred small rows ever exist here).
 */
export function clearAllQueries() {
  clearAllEntries();
  return globalMutate(() => true, undefined, { revalidate: false });
}

export { cacheKeyPrefixes };
