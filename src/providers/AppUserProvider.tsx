"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTelegram } from "@/providers/TelegramProvider";
import {
  authenticateTelegram,
  fetchMe,
  logout as apiLogout,
  submitOnboarding,
} from "@/lib/api/client";
import { runWithTimeout, TimeoutError } from "@/lib/async-timeout";
import { clearAllQueries } from "@/lib/client/query-cache";
import { setOwnerKey, getOwnerKey, deriveOwnerKey } from "@/lib/client/owner";
import { cacheKeys } from "@/lib/client/cache-keys";
import { getEntry, persistEntry, deleteEntry } from "@/lib/client/persistent-cache";
import { logBootEvent } from "@/lib/client/perf-boot";
import type { AppUserDTO, OnboardingInputDTO } from "@/lib/api/types";

/** Hard ceiling for the Telegram bootstrap; production must never load forever. */
const BOOTSTRAP_TIMEOUT_MS = 9000;
/** Sprint: mini-app-cold-start, section 7 — how stale a speculative identity
 * snapshot may be before it isn't even worth showing (matches persistent-
 * cache-core.ts's own identity-snapshot TTL intent). */
const IDENTITY_SNAPSHOT_TTL_MS = 5 * 60_000;

/** Safe bootstrap diagnostics — phase + duration only. No initData/token/PII. */
function logBoot(phase: string, startedAt: number) {
  console.info(`[app-bootstrap] ${JSON.stringify({ phase, durationMs: Math.round(performance.now() - startedAt) })}`);
}

/**
 * Server-session bootstrap. Inside Telegram it verifies initData server-side,
 * opens a session, and loads the canonical user from /api/auth/me — which is the
 * source of truth. Outside Telegram (or with no backend) it stays in "demo" and
 * never blocks rendering, so the existing localStorage demo flow keeps working.
 *
 * Sprint: mini-app-cold-start, sections 5/7/8/9 — a new "cached" status sits
 * between "loading" and "authenticated": the moment the Telegram owner is
 * known, this provider races TWO independent reads in parallel —
 *  (a) the real server round trip (authenticateTelegram, unchanged, always
 *      authoritative), and
 *  (b) a local IndexedDB read of this owner's last-known identity snapshot
 *      (persistent-cache.ts's getEntry — NOT the useQuery/SWR system; this
 *      provider sits ABOVE PersistentCacheProvider in the tree specifically
 *      so its own bootstrap never waits on that provider's cache — see
 *      providers.tsx).
 * Whichever resolves first is what renders. If (b) wins, status becomes
 * "cached" — EmployeeBootGate treats that as "ready enough to show a shell"
 * (bootPhase's hasCachedIdentity), but `isIdentityConfirmed` stays false
 * until (a) lands, and screens that must never speculate (Home's
 * CITY_MANAGER/CLUB_MANAGER branches — section 7) gate on that flag
 * specifically. The `confirmed` ref below is the only thing standing
 * between "(b) resolves after (a)" and a stale snapshot clobbering an
 * already-authoritative result — once (a) settles (success OR failure) the
 * snapshot branch is permanently inert for this bootstrap.
 *
 * Section 9 — this snapshot is a DISPLAY HINT ONLY, by construction: it is
 * never read by any authorize() call, any API route, or any mutation path —
 * those all continue to depend solely on the real session cookie the SAME
 * as before this feature existed. It exists purely so `hydrated`/`profile`
 * (app-provider.tsx) have something honest to show before the network
 * round trip finishes.
 */

type AppUserStatus = "loading" | "cached" | "authenticated" | "anonymous" | "demo" | "error";

interface AppUserContextValue {
  status: AppUserStatus;
  user: AppUserDTO | null;
  isAuthenticated: boolean;
  /** True only while NEITHER a cached snapshot nor a real response exists yet. */
  isBootstrapping: boolean;
  /** True once the real server session has confirmed identity/access — false
   * while `status === "cached"` (a speculative, unconfirmed render). */
  isIdentityConfirmed: boolean;
  /** True when bootstrap failed inside Telegram (needs retry). */
  hasError: boolean;
  refresh: () => Promise<void>;
  retry: () => void;
  saveOnboarding: (input: OnboardingInputDTO) => Promise<AppUserDTO>;
  signOut: () => Promise<void>;
}

const AppUserContext = createContext<AppUserContextValue | null>(null);

export function AppUserProvider({ children }: { children: React.ReactNode }) {
  const { isReady, isInsideTelegram, initData, telegramUser } = useTelegram();
  const [status, setStatus] = useState<AppUserStatus>("loading");
  const [user, setUser] = useState<AppUserDTO | null>(null);
  const started = useRef(false);
  /** Flips true the instant the REAL bootstrap settles (success or error) —
   * guards against the slower of the two parallel reads overwriting the
   * authoritative one, regardless of which happens to finish first. */
  const confirmed = useRef(false);

  const bootstrap = useCallback(async () => {
    const startedAt = performance.now();
    if (!isInsideTelegram || !initData) {
      logBoot("demo", startedAt);
      setStatus("demo");
      setUser(null);
      return;
    }

    // Section 5 — owner key must be set BEFORE either read below; set here
    // too (not only by PersistentCacheProvider) so this provider's own
    // identity-snapshot key never depends on sibling-effect ordering.
    const ownerKey = deriveOwnerKey(telegramUser);
    setOwnerKey(ownerKey);
    confirmed.current = false;

    // Parallel branch (b): a cached, speculative snapshot — never awaited,
    // never blocks branch (a) from starting on the very next line.
    void getEntry<AppUserDTO>(cacheKeys.identitySnapshot()).then((snap) => {
      if (snap && !confirmed.current) {
        setUser(snap);
        setStatus("cached");
      }
    });

    // Parallel branch (a): the real, authoritative bootstrap (unchanged core
    // logic/timeout from before this sprint).
    logBoot("auth_request_start", startedAt);
    logBootEvent("auth_request_start");
    try {
      // The auth response IS the authoritative user (same meDTO as /api/auth/me,
      // incl. onboardingCompleted + profile) and it opens the session. We use it
      // directly — a second /api/auth/me round-trip here can transiently miss the
      // just-set session cookie in some Telegram WebViews, which would misread an
      // onboarded user as anonymous and wrongly force onboarding again.
      //
      // HARD TIMEOUT: if the request hangs (server cold start, network stall in the
      // iOS WebView, a hung upstream) the AbortSignal cancels the fetch and this
      // rejects with TimeoutError, so we always leave "loading" for a recoverable
      // "error" state instead of an infinite spinner.
      const authed = await runWithTimeout(
        (signal) => authenticateTelegram(initData, signal),
        BOOTSTRAP_TIMEOUT_MS,
      );
      confirmed.current = true;
      logBoot("auth_request_success", startedAt);
      logBootEvent("auth_response_received");
      setUser(authed);
      setStatus("authenticated");
      persistIdentitySnapshot(authed);
    } catch (e) {
      confirmed.current = true;
      logBoot(e instanceof TimeoutError ? "auth_timeout" : "auth_request_error", startedAt);
      logBootEvent("auth_response_received", { error: true });
      // Backend unreachable / too slow — surface a retryable error; never fabricate
      // a "needs onboarding" state from a failed bootstrap. This also discards
      // whatever the cached branch may have speculatively rendered — an
      // unreachable server is never grounds to keep showing stale content
      // with no way to correct it.
      setStatus("error");
      setUser(null);
    }
  }, [isInsideTelegram, initData, telegramUser]);

  useEffect(() => {
    if (!isReady || started.current) return;
    started.current = true;
    void bootstrap();
  }, [isReady, bootstrap]);

  const refresh = useCallback(async () => {
    try {
      const me = await fetchMe();
      setUser(me);
      setStatus(me ? "authenticated" : "anonymous");
      if (me) persistIdentitySnapshot(me);
    } catch {
      /* keep current state */
    }
  }, []);

  /** Re-run the full bootstrap (used by the error/retry UI). */
  const retry = useCallback(() => {
    setStatus("loading");
    void bootstrap();
  }, [bootstrap]);

  const saveOnboarding = useCallback(async (input: OnboardingInputDTO) => {
    const saved = await submitOnboarding(input);
    setUser(saved);
    setStatus("authenticated");
    persistIdentitySnapshot(saved);
    return saved;
  }, []);

  const signOut = useCallback(async () => {
    try {
      await apiLogout();
    } finally {
      // Sprint: mini-app-performance, section 17 — never leave this
      // session's cached responses reachable after sign-out. Section 10
      // (cold-start) — the identity snapshot specifically, since it lives
      // outside the L1/L2 SWR cache clearAllQueries() otherwise sweeps.
      clearAllQueries();
      deleteEntry(cacheKeys.identitySnapshot());
      setUser(null);
      setStatus("anonymous");
    }
  }, []);

  const value = useMemo<AppUserContextValue>(
    () => ({
      status,
      user,
      isAuthenticated: status === "authenticated",
      isBootstrapping: status === "loading",
      isIdentityConfirmed: status === "authenticated" || status === "anonymous" || status === "demo",
      hasError: status === "error",
      refresh,
      retry,
      saveOnboarding,
      signOut,
    }),
    [status, user, refresh, retry, saveOnboarding, signOut],
  );

  return (
    <AppUserContext.Provider value={value}>{children}</AppUserContext.Provider>
  );
}

/** Section 12 — View As must never be persisted: skip entirely whenever a
 * preview is active, defensively null it out even so. Fire-and-forget,
 * never throws (persistEntry's own contract). */
function persistIdentitySnapshot(user: AppUserDTO) {
  if (user.viewContext) return;
  persistEntry(cacheKeys.identitySnapshot(), getOwnerKey(), { ...user, viewContext: null }, IDENTITY_SNAPSHOT_TTL_MS);
}

export function useAppUser() {
  const ctx = useContext(AppUserContext);
  if (!ctx) throw new Error("useAppUser must be used within AppUserProvider");
  return ctx;
}
