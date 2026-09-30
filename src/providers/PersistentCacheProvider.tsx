"use client";

import { useEffect, useRef, useState } from "react";
import { SWRConfig, type Cache } from "swr";
import { useTelegram } from "@/providers/TelegramProvider";
import { setOwnerKey } from "@/lib/client/owner";
import { hydrateOwnerEntries, deleteAllForOwner } from "@/lib/client/persistent-cache";
import { createPersistentCache } from "@/lib/client/persistent-swr-cache";
import { markAppOpened } from "@/lib/client/reopen-grace";

/**
 * Sprint: mini-app-persistent-cache, sections 1/3/10/13 — the ONE place that
 * establishes the L1(SWR)/L2(IndexedDB) cache for the whole app, BEFORE
 * anything below it (AppUserProvider, every screen) mounts. Placement in
 * the provider tree matters: it sits inside TelegramProvider (needs the
 * Telegram WebApp user id — available client-side as soon as Telegram's
 * script has initialized, independent of any server round trip) and
 * outside AppUserProvider/every screen (its own server auth bootstrap runs
 * IN PARALLEL with this, never blocked by it, and never the other way
 * around either — see the report's "App bootstrap" section for the
 * deliberate boundary: this unblocks the DATA cache only, never the
 * identity/access gate itself).
 *
 * Step 1 (identify owner) + step 2 (hydrate) happen here, synchronously
 * with respect to render: `{children}` — the whole rest of the app,
 * including every useQuery call site — does not mount until the hydrated
 * Map is ready (or a short timeout elapses), so the very first render of
 * any screen already has L2 data available in L1, with zero extra fetch.
 */
const HYDRATION_TIMEOUT_MS = 400;

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
  const [cache, setCache] = useState<Cache | null>(null);
  const [ownerKeyForRemount, setOwnerKeyForRemount] = useState<string | null>(null);
  const previousOwner = useRef<string | null>(null);

  useEffect(() => {
    if (!isReady) return;
    const ownerKey = telegramUser?.id != null ? String(telegramUser.id) : "demo";
    if (previousOwner.current === ownerKey) return; // already hydrated for this owner this session

    const priorOwner = previousOwner.current;
    previousOwner.current = ownerKey;
    let cancelled = false;

    void (async () => {
      // Section 10 — a genuine owner change (NOT the initial null -> ownerKey
      // transition every launch goes through) must not rely on TTL expiry
      // alone: the prior owner's rows are removed before the new owner's
      // are ever read.
      if (priorOwner && priorOwner !== ownerKey) {
        await deleteAllForOwner(priorOwner);
      }
      setOwnerKey(ownerKey);
      const hydrated = await withTimeout(hydrateOwnerEntries(ownerKey), HYDRATION_TIMEOUT_MS, new Map());
      if (cancelled) return;
      markAppOpened();
      setCache(createPersistentCache(hydrated));
      setOwnerKeyForRemount(ownerKey);
    })();

    return () => {
      cancelled = true;
    };
  }, [isReady, telegramUser]);

  // Brief, bounded gate (<= HYDRATION_TIMEOUT_MS, typically far less — an
  // IndexedDB read of a few dozen small rows) — the same category of "blank
  // frame before the app shell paints" every SPA already has, not a new
  // user-visible skeleton (section 8's "no full skeleton" is about SCREEN
  // content once the app IS rendering, which this precedes).
  if (!cache) return null;

  // key={ownerKeyForRemount} forces a full remount of everything below on a
  // genuine owner change — SWRConfig's `provider` factory is otherwise only
  // resolved once per mount, so swapping `cache` in state alone would not
  // reach already-mounted useSWR consumers.
  return (
    <SWRConfig key={ownerKeyForRemount} value={{ provider: () => cache }}>
      {children}
    </SWRConfig>
  );
}
