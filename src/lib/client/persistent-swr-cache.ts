"use client";

import type { Cache, State } from "swr";
import { getPersistPolicy } from "./persistent-cache-core";
import { persistEntry, deleteEntry } from "./persistent-cache";

/**
 * Sprint: mini-app-persistent-cache — the swr `Cache` provider (a Map-like
 * get/set/delete/keys interface SWR itself calls on every read/write) that
 * makes L2 transparent to every screen: `useQuery` (query-cache.ts) never
 * knows L2 exists at all, it just gets a `Cache` that happens to also be
 * durable. `initial` is the ALREADY-hydrated Map from persistent-cache.ts's
 * hydrateOwnerEntries — read once, up front, before this is ever handed to
 * SWRConfig (see PersistentCacheProvider) — this file performs no I/O on
 * its own read path, only on writes.
 */
export function createPersistentCache(initial: Map<string, State>): Cache {
  const map = initial;
  return {
    keys: () => map.keys(),
    get: (key) => map.get(key),
    set: (key, value) => {
      map.set(key, value);
      const policy = getPersistPolicy(key);
      // Only a settled, error-free, data-bearing state is worth a durable
      // write — an in-flight/error state persisted would just be
      // overwritten again a moment later, or would feed an error back on
      // the next cold start where "nothing cached" is the honest answer.
      if (policy && value.data !== undefined && value.error === undefined) {
        persistEntry(key, ownerOf(key), value.data, policy.ttlMs);
      }
    },
    delete: (key) => {
      map.delete(key);
      deleteEntry(key);
    },
  };
}

/** Every key is `{category}:{owner}:...rest` (cache-keys.ts) — the owner
 * segment is always index 1, regardless of category or rest shape. */
function ownerOf(key: string): string {
  return key.split(":")[1] ?? "";
}
