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
import type { AppUserDTO, OnboardingInputDTO } from "@/lib/api/types";

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

  const bootstrap = useCallback(async () => {
    if (!isInsideTelegram || !initData) {
      setStatus("demo");
      setUser(null);
      return;
    }
    try {
      await authenticateTelegram(initData);
      const me = await fetchMe();
      setUser(me);
      setStatus(me ? "authenticated" : "anonymous");
    } catch {
      // No backend reachable — degrade to demo without breaking the app.
      setStatus("error");
      setUser(null);
    }
  }, [isInsideTelegram, initData]);

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

  /** Re-run the full bootstrap (used by the error/retry UI). */
  const retry = useCallback(() => {
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
      isAuthenticated: status === "authenticated",
      isBootstrapping: status === "loading",
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

export function useAppUser() {
  const ctx = useContext(AppUserContext);
  if (!ctx) throw new Error("useAppUser must be used within AppUserProvider");
  return ctx;
}
