"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  getTelegramUser,
  initViewport,
} from "@/lib/telegram";
import type { TelegramUser, UserProfile } from "@/lib/types";

interface AppContextValue {
  /** True once client-side hydration of the stored profile is complete. */
  hydrated: boolean;
  telegramUser: TelegramUser | null;
  profile: UserProfile;
  updateProfile: (patch: Partial<UserProfile>) => void;
  resetProfile: () => void;
  /** Whether city/club/position have all been chosen. */
  isSetupComplete: boolean;
}

const STORAGE_KEY = "metro.profile";

/**
 * Demo fallback used when the Telegram WebApp SDK is unavailable (e.g. the app
 * is opened in a normal browser for a demo or presentation). In production,
 * real Telegram data takes priority over this — see the effect below.
 */
const DEMO_USER: TelegramUser = {
  id: 0,
  firstName: "Даниил",
  username: "metro_demo",
};

function defaultProfile(name: string): UserProfile {
  return {
    displayName: name,
    cityId: null,
    clubId: null,
    positionId: null,
    xp: 4280,
    streak: 7,
  };
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [telegramUser, setTelegramUser] = useState<TelegramUser | null>(null);
  const [profile, setProfile] = useState<UserProfile>(() =>
    defaultProfile(DEMO_USER.firstName),
  );

  useEffect(() => {
    initViewport();
    // Prefer real Telegram data; fall back to the browser demo user.
    const tgUser = getTelegramUser() ?? DEMO_USER;
    setTelegramUser(tgUser);

    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as UserProfile;
        setProfile({ ...defaultProfile(tgUser.firstName), ...parsed });
      } catch {
        setProfile(defaultProfile(tgUser.firstName));
      }
    } else {
      setProfile(defaultProfile(tgUser.firstName));
    }
    setHydrated(true);
  }, []);

  // Persist profile changes after hydration.
  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  }, [profile, hydrated]);

  const updateProfile = useCallback((patch: Partial<UserProfile>) => {
    setProfile((prev) => ({ ...prev, ...patch }));
  }, []);

  const resetProfile = useCallback(() => {
    setProfile(defaultProfile(telegramUser?.firstName ?? DEMO_USER.firstName));
  }, [telegramUser]);

  const value = useMemo<AppContextValue>(
    () => ({
      hydrated,
      telegramUser,
      profile,
      updateProfile,
      resetProfile,
      isSetupComplete: Boolean(
        profile.cityId && profile.clubId && profile.positionId,
      ),
    }),
    [hydrated, telegramUser, profile, updateProfile, resetProfile],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
