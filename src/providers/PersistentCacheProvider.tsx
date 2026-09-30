"use client";

import { useEffect, useRef, useState } from "react";
import { SWRConfig, type Cache, type State } from "swr";
import { useTelegram } from "@/providers/TelegramProvider";
import { setOwnerKey, deriveOwnerKey } from "@/lib/client/owner";
import { hydrateOwnerEntries, deleteAllForOwner } from "@/lib/client/persistent-cache";
import { createPersistentCache } from "@/lib/client/persistent-swr-cache";
import { markAppOpened } from "@/lib/client/reopen-grace";
import { logBootEvent } from "@/lib/client/perf-boot";

/**
 * Sprint: mini-app-persistent-cache / mini-app-cold-start — establishes the
 * L1(SWR)/L2(IndexedDB) cache for the whole app.
 *
 * REVISED (mini-app-cold-start, section 5): this used to `return null` —
 * blocking ALL of `{children}` (the whole rest of the app, AppShellFrame's
 * EmployeeBootGate included) until hydration resolved, up to a 400ms
 * timeout. That serialized "IndexedDB THEN app" even though the two are
 * independent, and it sat ABOVE AppUserProvider in the tree, so it
 * incidentally delayed the auth request's START too. Both are now fixed:
 * AppUserProvider has moved above this provider (see providers.tsx — its
 * bootstrap effect fires on its own mount, never gated by this one), and
 * this provider now ALWAYS renders `{children}` synchronously on first
 * render, with a cache that starts empty and is populated in place once
 * hydration resolves. A screen that happens to mount and read a key before
 * hydration finishes just sees a cache miss and fetches fresh — never worse
 * than pre-cache behavior, only occasionally not as fast as possible; in
 * practice EmployeeBootGate's own gate (identity must be at least
 * cache-confirmed or server-confirmed) means real screens mount well after
 * this hydration — itself a fast local IndexedDB read — has finished.
 */
const HYDRATION_TIMEOUT_MS = 2_000;

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

export function PersistentCacheProvider({ children }: { children: React.ReactNode }) {
  const { telegramUser, isReady } = useTelegram();
  const rawMap = useRef<Map<string, State>>(new Map());
  const [cache] = useState<Cache>(() => createPersistentCache(rawMap.current));
  const [remountKey, setRemountKey] = useState(0);
  const previousOwner = useRef<string | null>(null);

  useEffect(() => {
    if (!isReady) return;
    const ownerKey = deriveOwnerKey(telegramUser);
    if (previousOwner.current === ownerKey) return; // already hydrated for this owner this session

    const priorOwner = previousOwner.current;
    previousOwner.current = ownerKey;
    let cancelled = false;

    void (async () => {
      logBootEvent("persistent_cache_start");
      // Section 10 — a genuine owner change (NOT the initial null -> ownerKey
      // transition every launch goes through): the prior owner's rows must
      // not rely on TTL expiry alone, AND the in-memory Map (which still
      // holds them) must be cleared too — deleteAllForOwner only touches
      // IndexedDB. A key-change remount then resets SWR's own per-hook
      // subscription state on top of the now-empty Map.
      if (priorOwner && priorOwner !== ownerKey) {
        await deleteAllForOwner(priorOwner);
        rawMap.current.clear();
        setRemountKey((k) => k + 1);
      }
      setOwnerKey(ownerKey);
      const hydrated = await withTimeout(hydrateOwnerEntries(ownerKey), HYDRATION_TIMEOUT_MS, new Map());
      if (cancelled) return;
      // Merge directly into the SAME Map object already backing the live
      // Cache (bypassing its write-through .set() — this data just came
      // FROM L2, re-persisting it immediately would be pointless). Any
      // useSWR hook that mounts from here on sees these entries; one that
      // already mounted and missed the cache keeps its own fetch in flight
      // (not fixed retroactively, not broken either).
      for (const [k, v] of hydrated) rawMap.current.set(k, v as State);
      logBootEvent("persistent_cache_ready", { entries: hydrated.size });
      markAppOpened();
    })();

    return () => {
      cancelled = true;
    };
  }, [isReady, telegramUser]);

  return (
    <SWRConfig key={remountKey} value={{ provider: () => cache }}>
      {children}
    </SWRConfig>
  );
}
