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
import { useAppUser } from "@/providers/AppUserProvider";
import { isClubInCity } from "@/content/cities";
import { isValidPositionId, type PositionId } from "@/content/positions";
import {
  clearStoredProfile,
  createProfile,
  isValidDisplayName,
  loadStoredProfile,
  PROFILE_VERSION,
  saveProfile,
  type UserProfile,
} from "@/lib/profile";
import { trackEvent } from "@/lib/analytics";
import type { AppUserDTO } from "@/lib/api/types";
import type { TelegramUser } from "@/lib/types";

interface OnboardingDraft {
  displayName: string;
  cityId: string | null;
  clubId: string | null;
  positionId: PositionId | null;
}

interface AppContextValue {
  /** True once a routing decision can be made (bootstrap + local read done). */
  hydrated: boolean;
  /** True while the initial server bootstrap is still resolving. */
  bootstrapping: boolean;
  /** True when the Telegram bootstrap failed and needs a retry. */
  bootstrapError: boolean;
  retryBootstrap: () => void;
  /** Resolved user: real Telegram user inside Telegram, demo user otherwise. */
  telegramUser: TelegramUser;
  /**
   * Committed, validated profile. Server profile is the source of truth inside
   * Telegram; localStorage is used only in browser demo. Null → onboarding.
   */
  profile: UserProfile | null;
  isOnboarded: boolean;
  draft: OnboardingDraft;
  setDisplayName: (name: string) => void;
  selectCity: (cityId: string) => void;
  selectClub: (clubId: string) => void;
  selectPosition: (positionId: PositionId) => void;
  canComplete: boolean;
  /** Persists onboarding — to the server inside Telegram, else to localStorage. */
  completeOnboarding: () => Promise<UserProfile | null>;
  resetOnboarding: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

function defaultDisplayName(user: TelegramUser): string {
  const full = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return full || user.firstName;
}

/** Map the server user DTO to the profile shape screens consume. */
function serverToProfile(u: AppUserDTO | null): UserProfile | null {
  if (!u || !u.onboardingCompleted || !u.profile) return null;
  return {
    version: PROFILE_VERSION,
    telegramId: null, // never exposed to the client
    telegramUsername: u.telegram.username,
    displayName: u.displayName,
    cityId: u.profile.cityId,
    clubId: u.profile.clubId,
    positionId: u.profile.positionId,
    careerLevel: u.profile.careerLevel, // server-controlled
    accessStatus: u.profile.accessStatus, // server-controlled
    onboardingCompleted: true,
    createdAt: "",
    updatedAt: "",
  };
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const {
    user,
    telegramUser: realTelegramUser,
    isInsideTelegram,
    isReady: tgReady,
  } = useTelegram();
  const appUser = useAppUser();

  const [localReady, setLocalReady] = useState(false);
  const [localProfile, setLocalProfile] = useState<UserProfile | null>(null);
  const [draft, setDraft] = useState<OnboardingDraft>({
    displayName: "",
    cityId: null,
    clubId: null,
    positionId: null,
  });

  // Server profile is authoritative when present.
  const serverProfile = useMemo(
    () => serverToProfile(appUser.user),
    [appUser.user],
  );

  // Read localStorage once (browser demo source + onboarding prefill/migration).
  useEffect(() => {
    if (!tgReady || localReady) return;
    const stored = loadStoredProfile();
    setLocalProfile(stored);
    setDraft({
      displayName: stored?.displayName ?? defaultDisplayName(user),
      cityId: stored?.cityId ?? null,
      clubId: stored?.clubId ?? null,
      positionId: stored?.positionId ?? null,
    });
    if (!stored) trackEvent("onboarding_started");
    setLocalReady(true);
  }, [tgReady, localReady, user]);

  // When a server profile resolves, prefill the draft from it (server wins).
  useEffect(() => {
    if (!serverProfile) return;
    setDraft({
      displayName: serverProfile.displayName,
      cityId: serverProfile.cityId,
      clubId: serverProfile.clubId,
      positionId: serverProfile.positionId,
    });
  }, [serverProfile]);

  // Bootstrap resolution: inside Telegram we wait for auth; in demo for "demo".
  const bootstrapDecided =
    appUser.status === "authenticated" ||
    appUser.status === "anonymous" ||
    appUser.status === "demo";
  const bootstrapError = appUser.status === "error";
  const bootstrapping = appUser.isBootstrapping;
  const hydrated = localReady && bootstrapDecided;

  // Source of truth: server inside Telegram, localStorage in browser demo.
  const profile = serverProfile ?? (isInsideTelegram ? null : localProfile);
  const isOnboarded = Boolean(profile?.onboardingCompleted);

  const setDisplayName = useCallback((name: string) => {
    const trimmed = name.trim();
    if (!isValidDisplayName(trimmed)) return;
    setDraft((d) => ({ ...d, displayName: trimmed }));
    trackEvent("onboarding_name_changed");
  }, []);

  const selectCity = useCallback((cityId: string) => {
    setDraft((d) => ({
      ...d,
      cityId,
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

  const completeOnboarding =
    useCallback(async (): Promise<UserProfile | null> => {
      if (
        !draft.cityId ||
        !draft.clubId ||
        !isValidPositionId(draft.positionId) ||
        !isClubInCity(draft.cityId, draft.clubId) ||
        !isValidDisplayName(draft.displayName)
      ) {
        return null;
      }

      // Inside Telegram: persist to the server (source of truth). Only the four
      // allowed fields are sent — role/accessStatus/careerLevel are server-set.
      if (isInsideTelegram && appUser.isAuthenticated) {
        const saved = await appUser.saveOnboarding({
          displayName: draft.displayName,
          cityId: draft.cityId,
          clubId: draft.clubId,
          positionId: draft.positionId,
        });
        const next = serverToProfile(saved);
        if (next) saveProfile(next); // localStorage becomes a cache only
        trackEvent("onboarding_completed", {
          cityId: draft.cityId,
          clubId: draft.clubId,
          positionId: draft.positionId,
        });
        return next;
      }

      // Browser demo: keep the existing local flow.
      const next = createProfile({
        telegramId: realTelegramUser ? String(realTelegramUser.id) : null,
        telegramUsername: user.username ?? null,
        displayName: draft.displayName,
        cityId: draft.cityId,
        clubId: draft.clubId,
        positionId: draft.positionId,
      });
      saveProfile(next);
      setLocalProfile(next);
      trackEvent("onboarding_completed", {
        cityId: next.cityId,
        clubId: next.clubId,
        positionId: next.positionId,
      });
      return next;
    }, [draft, isInsideTelegram, appUser, realTelegramUser, user.username]);

  const resetOnboarding = useCallback(() => {
    clearStoredProfile();
    setLocalProfile(null);
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
      bootstrapping,
      bootstrapError,
      retryBootstrap: appUser.retry,
      telegramUser: user,
      profile,
      isOnboarded,
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
      bootstrapping,
      bootstrapError,
      appUser.retry,
      user,
      profile,
      isOnboarded,
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
