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

/** Development fallback so the app is fully usable outside Telegram. */
const DEV_USER: TelegramUser = {
  id: 0,
  firstName: "Артём",
  lastName: "Метрик",
  username: "metro_hero",
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
    defaultProfile(DEV_USER.firstName),
  );

  useEffect(() => {
    initViewport();
    const tgUser = getTelegramUser() ?? DEV_USER;
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
    setProfile(defaultProfile(telegramUser?.firstName ?? DEV_USER.firstName));
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
