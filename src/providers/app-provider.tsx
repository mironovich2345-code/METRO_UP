"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useTelegram } from "@/providers/TelegramProvider";
import type { TelegramUser, UserProfile } from "@/lib/types";

interface AppContextValue {
  /** True once client-side hydration of the stored profile is complete. */
  hydrated: boolean;
  /** Resolved user: Telegram user inside Telegram, demo user otherwise. */
  telegramUser: TelegramUser;
  profile: UserProfile;
  updateProfile: (patch: Partial<UserProfile>) => void;
  resetProfile: () => void;
  /** Whether city/club/position have all been chosen. */
  isSetupComplete: boolean;
}

const STORAGE_KEY = "metro.profile";

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
  const { user, isReady: tgReady } = useTelegram();
  const [hydrated, setHydrated] = useState(false);
  const [profile, setProfile] = useState<UserProfile>(() =>
    defaultProfile(user.firstName),
  );

  // Seed the profile from localStorage once the Telegram environment resolves.
  // Stored setup (city/club/position) and edited name take priority; the
  // display name otherwise defaults to the Telegram/demo first name.
  useEffect(() => {
    if (!tgReady || hydrated) return;
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as UserProfile;
        setProfile({ ...defaultProfile(user.firstName), ...parsed });
      } catch {
        setProfile(defaultProfile(user.firstName));
      }
    } else {
      setProfile(defaultProfile(user.firstName));
    }
    setHydrated(true);
  }, [tgReady, hydrated, user.firstName]);

  // Persist profile changes (setup, display name) after hydration.
  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  }, [profile, hydrated]);

  const updateProfile = useCallback((patch: Partial<UserProfile>) => {
    setProfile((prev) => ({ ...prev, ...patch }));
  }, []);

  const resetProfile = useCallback(() => {
    setProfile(defaultProfile(user.firstName));
  }, [user.firstName]);

  const value = useMemo<AppContextValue>(
    () => ({
      hydrated,
      telegramUser: user,
      profile,
      updateProfile,
      resetProfile,
      isSetupComplete: Boolean(
        profile.cityId && profile.clubId && profile.positionId,
      ),
    }),
    [hydrated, user, profile, updateProfile, resetProfile],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
