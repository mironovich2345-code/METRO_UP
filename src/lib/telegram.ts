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

interface TgThemeParams {
  bg_color?: string;
  text_color?: string;
  hint_color?: string;
  button_color?: string;
}

export interface TelegramWebApp {
  initData: string;
  initDataUnsafe: { user?: TgWebAppUser };
  colorScheme: "light" | "dark";
  themeParams: TgThemeParams;
  isExpanded: boolean;
  ready: () => void;
  expand: () => void;
  disableVerticalSwipes?: () => void;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  onEvent: (event: string, handler: () => void) => void;
  offEvent: (event: string, handler: () => void) => void;
  HapticFeedback?: {
    impactOccurred: (style: "light" | "medium" | "heavy") => void;
    notificationOccurred: (type: "error" | "success" | "warning") => void;
    selectionChanged: () => void;
  };
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
