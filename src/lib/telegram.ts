import type { TelegramUser } from "./types";

/* Minimal, well-typed surface of the Telegram Mini Apps runtime.
   We read the canonical `window.Telegram.WebApp` object that the Telegram
   client injects — this is exactly what the Mini Apps SDK wraps, and reading
   it directly keeps us resilient to SDK version churn. */

interface TgWebAppUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  language_code?: string;
}

export interface TgThemeParams {
  bg_color?: string;
  text_color?: string;
  hint_color?: string;
  link_color?: string;
  button_color?: string;
  button_text_color?: string;
  secondary_bg_color?: string;
  header_bg_color?: string;
  accent_text_color?: string;
  section_bg_color?: string;
  subtitle_text_color?: string;
  destructive_text_color?: string;
}

export interface TgMainButton {
  text: string;
  color: string;
  textColor: string;
  isVisible: boolean;
  isActive: boolean;
  isProgressVisible: boolean;
  setText: (text: string) => void;
  onClick: (cb: () => void) => void;
  offClick: (cb: () => void) => void;
  show: () => void;
  hide: () => void;
  enable: () => void;
  disable: () => void;
  showProgress: (leaveActive?: boolean) => void;
  hideProgress: () => void;
  setParams: (params: {
    text?: string;
    color?: string;
    text_color?: string;
    is_active?: boolean;
    is_visible?: boolean;
  }) => void;
}

export interface TgBackButton {
  isVisible: boolean;
  onClick: (cb: () => void) => void;
  offClick: (cb: () => void) => void;
  show: () => void;
  hide: () => void;
}

export interface TgHapticFeedback {
  impactOccurred: (style: "light" | "medium" | "heavy" | "rigid" | "soft") => void;
  notificationOccurred: (type: "error" | "success" | "warning") => void;
  selectionChanged: () => void;
}

export interface TelegramWebApp {
  initData: string;
  initDataUnsafe: { user?: TgWebAppUser; auth_date?: number; hash?: string };
  version: string;
  platform: string;
  colorScheme: "light" | "dark";
  themeParams: TgThemeParams;
  isExpanded: boolean;
  viewportHeight: number;
  viewportStableHeight: number;
  headerColor?: string;
  backgroundColor?: string;
  isClosingConfirmationEnabled?: boolean;
  ready: () => void;
  expand: () => void;
  close?: () => void;
  disableVerticalSwipes?: () => void;
  enableClosingConfirmation?: () => void;
  disableClosingConfirmation?: () => void;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  onEvent: (event: string, handler: () => void) => void;
  offEvent: (event: string, handler: () => void) => void;
  MainButton?: TgMainButton;
  BackButton?: TgBackButton;
  HapticFeedback?: TgHapticFeedback;
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

export function getWebApp(): TelegramWebApp | null {
  if (typeof window === "undefined") return null;
  return window.Telegram?.WebApp ?? null;
}

export function isInsideTelegram(): boolean {
  const wa = getWebApp();
  return Boolean(wa && wa.initData);
}

/** Prepare the viewport: mark ready, expand, and lock swipe-to-close. */
export function initViewport(): void {
  const wa = getWebApp();
  if (!wa) return;
  wa.ready();
  wa.expand();
  wa.disableVerticalSwipes?.();
}

export function getTelegramUser(): TelegramUser | null {
  const wa = getWebApp();
  const u = wa?.initDataUnsafe?.user;
  if (!u) return null;
  return {
    id: u.id,
    firstName: u.first_name,
    lastName: u.last_name,
    username: u.username,
    photoUrl: u.photo_url,
  };
}

export function getTelegramColorScheme(): "light" | "dark" | null {
  return getWebApp()?.colorScheme ?? null;
}

type HapticStyle = "light" | "medium" | "heavy";

/** Fire a haptic tap when running inside Telegram; a no-op elsewhere. */
export function haptic(style: HapticStyle = "light"): void {
  getWebApp()?.HapticFeedback?.impactOccurred(style);
}

export function hapticSuccess(): void {
  getWebApp()?.HapticFeedback?.notificationOccurred("success");
}

export function hapticSelection(): void {
  getWebApp()?.HapticFeedback?.selectionChanged();
}
