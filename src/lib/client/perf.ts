"use client";

import { useEffect, useRef } from "react";

/**
 * Sprint: mini-app-performance, section 16 — client-side twin of
 * server/perf.ts. Dev-only (NODE_ENV==="development" — never shipped to a
 * real user's console in production); logs exactly once per screen mount,
 * the moment cached-or-fresh content actually becomes visible, never a
 * blank-skeleton timestamp.
 *
 * `cacheHit` is derived, not guessed: SWR's `isLoading` is true only during
 * a genuine "no cached data yet, fetching for the first time" phase — if
 * this screen's `isLoading` was NEVER observed true before `isReady` first
 * flips true, the content that appeared came from the cache, not the
 * network. This is how "does stale-while-revalidate actually make the
 * SECOND visit instant" gets a real, checkable number instead of a feeling.
 */
const ENABLED = process.env.NODE_ENV === "development";

export function useScreenPerfLog(screen: string, isReady: boolean, isLoading: boolean) {
  const loggedRef = useRef(false);
  const everLoadingRef = useRef(false);
  const mountedAt = useRef(0);
  if (mountedAt.current === 0) mountedAt.current = performance.now();
  if (isLoading) everLoadingRef.current = true;

  useEffect(() => {
    if (!ENABLED || loggedRef.current || !isReady) return;
    loggedRef.current = true;
    console.info(
      `[perf-screen] ${JSON.stringify({
        screen,
        firstUsefulRenderMs: Math.round(performance.now() - mountedAt.current),
        cacheHit: !everLoadingRef.current,
      })}`,
    );
  }, [screen, isReady]);
}
