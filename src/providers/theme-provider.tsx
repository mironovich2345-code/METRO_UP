"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { getTelegramColorScheme, getWebApp } from "@/lib/telegram";

export type ThemeMode = "light" | "dark" | "system";
type ResolvedTheme = "light" | "dark";

interface ThemeContextValue {
  mode: ThemeMode;
  resolved: ResolvedTheme;
  setMode: (mode: ThemeMode) => void;
  toggle: () => void;
}

const STORAGE_KEY = "metro.theme";
const ThemeContext = createContext<ThemeContextValue | null>(null);

function resolve(mode: ThemeMode): ResolvedTheme {
  if (mode !== "system") return mode;
  const tg = getTelegramColorScheme();
  if (tg) return tg;
  if (typeof window !== "undefined") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return "light";
}

function apply(resolved: ResolvedTheme) {
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  root.style.colorScheme = resolved;
  // Keep the Telegram chrome in sync with our surface color.
  const wa = getWebApp();
  const surface = resolved === "dark" ? "#09090b" : "#f7f7f8";
  wa?.setBackgroundColor?.(surface);
  wa?.setHeaderColor?.(surface);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>("system");
  const [resolved, setResolved] = useState<ResolvedTheme>("light");

  // Hydrate stored preference and apply on mount.
  useEffect(() => {
    const stored = (localStorage.getItem(STORAGE_KEY) as ThemeMode) || "system";
    const next = resolve(stored);
    setModeState(stored);
    setResolved(next);
    apply(next);
  }, []);

  // React to Telegram theme changes while in "system" mode.
  useEffect(() => {
    if (mode !== "system") return;
    const wa = getWebApp();
    const handler = () => {
      const next = resolve("system");
      setResolved(next);
      apply(next);
    };
    wa?.onEvent("themeChanged", handler);
    return () => wa?.offEvent("themeChanged", handler);
  }, [mode]);

  const setMode = useCallback((next: ThemeMode) => {
    localStorage.setItem(STORAGE_KEY, next);
    const r = resolve(next);
    setModeState(next);
    setResolved(r);
    apply(r);
  }, []);

  const toggle = useCallback(() => {
    setMode(resolved === "dark" ? "light" : "dark");
  }, [resolved, setMode]);

  const value = useMemo(
    () => ({ mode, resolved, setMode, toggle }),
    [mode, resolved, setMode, toggle],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
