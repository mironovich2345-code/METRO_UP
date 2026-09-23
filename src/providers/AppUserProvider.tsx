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
  type FetchPhase,
} from "@/lib/api/client";
import { runWithTimeout, TimeoutError } from "@/lib/async-timeout";
import { sendBootstrapDiag, newAttemptId, type BootstrapPhase } from "@/lib/bootstrap-diag";
import type { AppUserDTO, OnboardingInputDTO } from "@/lib/api/types";

/** Map the transport phase hook to the auth-specific bootstrap phase names. */
const FETCH_PHASE: Record<FetchPhase, BootstrapPhase> = {
  fetch_start: "auth_fetch_start",
  fetch_headers: "auth_fetch_headers",
  body_start: "auth_body_start",
  body_parsed: "auth_body_parsed",
};

/** Hard ceiling for the Telegram bootstrap; production must never load forever. */
const BOOTSTRAP_TIMEOUT_MS = 9000;

/** Safe bootstrap diagnostics — phase + duration only. No initData/token/PII. */
function logBoot(phase: string, startedAt: number) {
  console.info(`[app-bootstrap] ${JSON.stringify({ phase, durationMs: Math.round(performance.now() - startedAt) })}`);
}

/**
 * Server-session bootstrap. Inside Telegram it verifies initData server-side,
 * opens a session, and loads the canonical user from /api/auth/me — which is the
 * source of truth. Outside Telegram (or with no backend) it stays in "demo" and
 * never blocks rendering, so the existing localStorage demo flow keeps working.
 */

type AppUserStatus = "loading" | "authenticated" | "anonymous" | "demo" | "error";

interface AppUserContextValue {
  status: AppUserStatus;
  user: AppUserDTO | null;
  /** Non-personal id shared by all telemetry phases of the current bootstrap attempt. */
  attemptId: string;
  isAuthenticated: boolean;
  /** True only while the initial bootstrap is in flight. */
  isBootstrapping: boolean;
  /** True when bootstrap failed inside Telegram (needs retry). */
  hasError: boolean;
  refresh: () => Promise<void>;
  retry: () => void;
  saveOnboarding: (input: OnboardingInputDTO) => Promise<AppUserDTO>;
  signOut: () => Promise<void>;
}

const AppUserContext = createContext<AppUserContextValue | null>(null);

export function AppUserProvider({ children }: { children: React.ReactNode }) {
  const { isReady, isInsideTelegram, initData } = useTelegram();
  const [status, setStatus] = useState<AppUserStatus>("loading");
  const [user, setUser] = useState<AppUserDTO | null>(null);
  const started = useRef(false);

  // Telemetry attempt id: one per mount (a retry rolls a new one). Kept in a ref
  // too so the async bootstrap always reads the current attempt's id.
  const [attemptId, setAttemptId] = useState<string>(() => newAttemptId());
  const attemptIdRef = useRef(attemptId);
  attemptIdRef.current = attemptId;

  // Fire-and-forget phase beacon — observability only, never affects bootstrap.
  const emit = useCallback((phase: BootstrapPhase, durationMs?: number) => {
    sendBootstrapDiag({ phase, attemptId: attemptIdRef.current, durationMs });
  }, []);

  // Mount / unmount markers (detect WebView reload / provider remount loops).
  useEffect(() => {
    emit("client_mounted");
    return () => emit("provider_unmounted");
  }, [emit]);

  const bootstrap = useCallback(async () => {
    const startedAt = performance.now();
    const elapsed = () => Math.round(performance.now() - startedAt);
    emit("bootstrap_start");
    if (isInsideTelegram) emit("sdk_found");
    if (initData) emit("initdata_found");
    if (!isInsideTelegram || !initData) {
      logBoot("demo", startedAt);
      setStatus("demo");
      setUser(null);
      return;
    }
    logBoot("auth_request_start", startedAt);
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
        (signal) => authenticateTelegram(initData, signal, (p) => emit(FETCH_PHASE[p], elapsed())),
        BOOTSTRAP_TIMEOUT_MS,
      );
      emit("authenticate_returned", elapsed());
      logBoot("auth_request_success", startedAt);
      setUser(authed);
      setStatus("authenticated");
      emit("status_authenticated", elapsed());
    } catch (e) {
      const timedOut = e instanceof TimeoutError;
      logBoot(timedOut ? "auth_timeout" : "auth_request_error", startedAt);
      emit(timedOut ? "auth_timeout" : "auth_error", elapsed());
      // Backend unreachable / too slow — surface a retryable error; never fabricate
      // a "needs onboarding" state from a failed bootstrap.
      setStatus("error");
      setUser(null);
    }
  }, [isInsideTelegram, initData, emit]);

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
    } catch {
      /* keep current state */
    }
  }, []);

  /** Re-run the full bootstrap (used by the error/retry UI). A retry is a new
   *  telemetry attempt, so roll a fresh attemptId. */
  const retry = useCallback(() => {
    const id = newAttemptId();
    attemptIdRef.current = id;
    setAttemptId(id);
    setStatus("loading");
    void bootstrap();
  }, [bootstrap]);

  const saveOnboarding = useCallback(async (input: OnboardingInputDTO) => {
    const saved = await submitOnboarding(input);
    setUser(saved);
    setStatus("authenticated");
    return saved;
  }, []);

  const signOut = useCallback(async () => {
    try {
      await apiLogout();
    } finally {
      setUser(null);
      setStatus("anonymous");
    }
  }, []);

  const value = useMemo<AppUserContextValue>(
    () => ({
      status,
      user,
      attemptId,
      isAuthenticated: status === "authenticated",
      isBootstrapping: status === "loading",
      hasError: status === "error",
      refresh,
      retry,
      saveOnboarding,
      signOut,
    }),
    [status, user, attemptId, refresh, retry, saveOnboarding, signOut],
  );

  return (
    <AppUserContext.Provider value={value}>{children}</AppUserContext.Provider>
  );
}

export function useAppUser() {
  const ctx = useContext(AppUserContext);
  if (!ctx) throw new Error("useAppUser must be used within AppUserProvider");
  return ctx;
}
