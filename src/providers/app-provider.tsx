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
import { isClubInCity } from "@/content/cities";
import { isValidPositionId, type PositionId } from "@/content/positions";
import {
  clearStoredProfile,
  createProfile,
  isValidDisplayName,
  loadStoredProfile,
  saveProfile,
  type UserProfile,
} from "@/lib/profile";
import { trackEvent } from "@/lib/analytics";
import type { TelegramUser } from "@/lib/types";

interface OnboardingDraft {
  displayName: string;
  cityId: string | null;
  clubId: string | null;
  positionId: PositionId | null;
}

interface AppContextValue {
  /** True once the stored profile has been read on the client. */
  hydrated: boolean;
  /** Resolved user: real Telegram user inside Telegram, demo user otherwise. */
  telegramUser: TelegramUser;
  /** Committed, validated v2 profile, or null when onboarding is required. */
  profile: UserProfile | null;
  isOnboarded: boolean;
  /** Live onboarding selections (also seeded from an existing profile). */
  draft: OnboardingDraft;
  setDisplayName: (name: string) => void;
  selectCity: (cityId: string) => void;
  selectClub: (clubId: string) => void;
  selectPosition: (positionId: PositionId) => void;
  /** Whether the draft is complete & internally consistent. */
  canComplete: boolean;
  completeOnboarding: () => UserProfile | null;
  resetOnboarding: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

function defaultDisplayName(user: TelegramUser): string {
  const full = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return full || user.firstName;
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const {
    user,
    telegramUser: realTelegramUser,
    isReady: tgReady,
  } = useTelegram();

  const [hydrated, setHydrated] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [draft, setDraft] = useState<OnboardingDraft>({
    displayName: "",
    cityId: null,
    clubId: null,
    positionId: null,
  });

  // Hydrate from localStorage once the Telegram environment resolves.
  useEffect(() => {
    if (!tgReady || hydrated) return;
    const stored = loadStoredProfile();
    if (stored) {
      setProfile(stored);
      setDraft({
        displayName: stored.displayName,
        cityId: stored.cityId,
        clubId: stored.clubId,
        positionId: stored.positionId,
      });
    } else {
      // No profile (or invalid/legacy/Moscow) — start clean onboarding.
      clearStoredProfile();
      setProfile(null);
      setDraft({
        displayName: defaultDisplayName(user),
        cityId: null,
        clubId: null,
        positionId: null,
      });
      trackEvent("onboarding_started");
    }
    setHydrated(true);
  }, [tgReady, hydrated, user]);

  const setDisplayName = useCallback(
    (name: string) => {
      const trimmed = name.trim();
      if (!isValidDisplayName(trimmed)) return;
      setDraft((d) => ({ ...d, displayName: trimmed }));
      trackEvent("onboarding_name_changed");
      // If already onboarded, persist the change to the committed profile.
      setProfile((prev) => {
        if (!prev) return prev;
        const next = { ...prev, displayName: trimmed };
        saveProfile(next);
        return next;
      });
    },
    [],
  );

  const selectCity = useCallback((cityId: string) => {
    setDraft((d) => ({
      ...d,
      cityId,
      // Changing city always invalidates the previously chosen club.
      clubId: d.cityId === cityId ? d.clubId : null,
    }));
    trackEvent("onboarding_city_selected", { cityId });
  }, []);

  const selectClub = useCallback((clubId: string) => {
    setDraft((d) => ({ ...d, clubId }));
    trackEvent("onboarding_club_selected", { clubId });
  }, []);

  const selectPosition = useCallback((positionId: PositionId) => {
    setDraft((d) => ({ ...d, positionId }));
    trackEvent("onboarding_position_selected", { positionId });
  }, []);

  const canComplete = useMemo(
    () =>
      Boolean(
        isValidDisplayName(draft.displayName) &&
          draft.cityId &&
          draft.clubId &&
          isClubInCity(draft.cityId, draft.clubId) &&
          isValidPositionId(draft.positionId),
      ),
    [draft],
  );

  const completeOnboarding = useCallback((): UserProfile | null => {
    if (
      !draft.cityId ||
      !draft.clubId ||
      !isValidPositionId(draft.positionId) ||
      !isClubInCity(draft.cityId, draft.clubId) ||
      !isValidDisplayName(draft.displayName)
    ) {
      return null;
    }
    const next = createProfile({
      telegramId: realTelegramUser ? String(realTelegramUser.id) : null,
      telegramUsername: user.username ?? null,
      displayName: draft.displayName,
      cityId: draft.cityId,
      clubId: draft.clubId,
      positionId: draft.positionId,
    });
    saveProfile(next);
    setProfile(next);
    trackEvent("onboarding_completed", {
      cityId: next.cityId,
      clubId: next.clubId,
      positionId: next.positionId,
    });
    return next;
  }, [draft, realTelegramUser, user.username]);

  const resetOnboarding = useCallback(() => {
    clearStoredProfile();
    setProfile(null);
    setDraft({
      displayName: defaultDisplayName(user),
      cityId: null,
      clubId: null,
      positionId: null,
    });
  }, [user]);

  const value = useMemo<AppContextValue>(
    () => ({
      hydrated,
      telegramUser: user,
      profile,
      isOnboarded: Boolean(profile?.onboardingCompleted),
      draft,
      setDisplayName,
      selectCity,
      selectClub,
      selectPosition,
      canComplete,
      completeOnboarding,
      resetOnboarding,
    }),
    [
      hydrated,
      user,
      profile,
      draft,
      setDisplayName,
      selectCity,
      selectClub,
      selectPosition,
      canComplete,
      completeOnboarding,
      resetOnboarding,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
