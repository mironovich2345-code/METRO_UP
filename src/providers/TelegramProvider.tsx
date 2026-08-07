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
import {
  getWebApp,
  type TelegramWebApp,
  type TgThemeParams,
} from "@/lib/telegram";
import type { TelegramUser } from "@/lib/types";

/**
 * Demo user used when the app runs outside Telegram (normal browser, local dev,
 * presentation). Inside Telegram, real `initDataUnsafe.user` always wins.
 */
export const DEMO_USER: TelegramUser = {
  id: 0,
  firstName: "Даниил",
  lastName: "Миронович",
  username: "metro_demo",
};

interface Viewport {
  height: number;
  stableHeight: number;
  isExpanded: boolean;
}

interface MainButtonConfig {
  text: string;
  onClick: () => void;
  enabled?: boolean;
  progress?: boolean;
}

interface TelegramContextValue {
  /** Raw Telegram WebApp object, or null outside Telegram. */
  webApp: TelegramWebApp | null;
  /** True only when launched inside a real Telegram client. */
  isInsideTelegram: boolean;
  /** True once the client-side environment has been resolved. */
  isReady: boolean;

  // Launch data
  initData: string;
  initDataUnsafe: TelegramWebApp["initDataUnsafe"] | null;

  // Resolved user (Telegram user inside Telegram, DEMO_USER otherwise)
  user: TelegramUser;
  /** The real Telegram user, or null when running outside Telegram. */
  telegramUser: TelegramUser | null;

  // Environment
  colorScheme: "light" | "dark";
  themeParams: TgThemeParams;
  version: string;
  platform: string;
  viewport: Viewport;

  // Imperative controls
  ready: () => void;
  expand: () => void;
  haptic: (style?: "light" | "medium" | "heavy") => void;
  hapticSuccess: () => void;
  hapticSelection: () => void;
  setClosingConfirmation: (enabled: boolean) => void;
  showMainButton: (config: MainButtonConfig) => void;
  hideMainButton: () => void;
  showBackButton: (onClick: () => void) => void;
  hideBackButton: () => void;
}

const TelegramContext = createContext<TelegramContextValue | null>(null);

function mapUser(wa: TelegramWebApp | null): TelegramUser | null {
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

function readViewport(wa: TelegramWebApp | null): Viewport {
  return {
    height: wa?.viewportHeight ?? 0,
    stableHeight: wa?.viewportStableHeight ?? 0,
    isExpanded: wa?.isExpanded ?? false,
  };
}

export function TelegramProvider({ children }: { children: React.ReactNode }) {
  const [webApp, setWebApp] = useState<TelegramWebApp | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [colorScheme, setColorScheme] = useState<"light" | "dark">("light");
  const [themeParams, setThemeParams] = useState<TgThemeParams>({});
  const [viewport, setViewport] = useState<Viewport>({
    height: 0,
    stableHeight: 0,
    isExpanded: false,
  });

  // Keep the currently-registered MainButton handler so we can detach it.
  const mainButtonHandler = useRef<(() => void) | null>(null);
  const backButtonHandler = useRef<(() => void) | null>(null);

  // One-time initialization on the client.
  useEffect(() => {
    const wa = getWebApp();
    setWebApp(wa);

    if (wa) {
      // Required Telegram lifecycle.
      wa.ready();
      wa.expand();
      wa.disableVerticalSwipes?.();
      wa.enableClosingConfirmation?.();

      setColorScheme(wa.colorScheme);
      setThemeParams(wa.themeParams ?? {});
      setViewport(readViewport(wa));

      const onTheme = () => {
        setColorScheme(wa.colorScheme);
        setThemeParams(wa.themeParams ?? {});
      };
      const onViewport = () => setViewport(readViewport(wa));

      wa.onEvent("themeChanged", onTheme);
      wa.onEvent("viewportChanged", onViewport);

      setIsReady(true);
      return () => {
        wa.offEvent("themeChanged", onTheme);
        wa.offEvent("viewportChanged", onViewport);
      };
    }

    setIsReady(true);
  }, []);

  const ready = useCallback(() => webApp?.ready(), [webApp]);
  const expand = useCallback(() => webApp?.expand(), [webApp]);

  const haptic = useCallback(
    (style: "light" | "medium" | "heavy" = "light") =>
      webApp?.HapticFeedback?.impactOccurred(style),
    [webApp],
  );
  const hapticSuccess = useCallback(
    () => webApp?.HapticFeedback?.notificationOccurred("success"),
    [webApp],
  );
  const hapticSelection = useCallback(
    () => webApp?.HapticFeedback?.selectionChanged(),
    [webApp],
  );

  const setClosingConfirmation = useCallback(
    (enabled: boolean) => {
      if (enabled) webApp?.enableClosingConfirmation?.();
      else webApp?.disableClosingConfirmation?.();
    },
    [webApp],
  );

  const showMainButton = useCallback(
    ({ text, onClick, enabled = true, progress = false }: MainButtonConfig) => {
      const mb = webApp?.MainButton;
      if (!mb) return;
      if (mainButtonHandler.current) mb.offClick(mainButtonHandler.current);
      mainButtonHandler.current = onClick;
      mb.setText(text);
      if (enabled) mb.enable();
      else mb.disable();
      if (progress) mb.showProgress();
      else mb.hideProgress();
      mb.onClick(onClick);
      mb.show();
    },
    [webApp],
  );

  const hideMainButton = useCallback(() => {
    const mb = webApp?.MainButton;
    if (!mb) return;
    if (mainButtonHandler.current) {
      mb.offClick(mainButtonHandler.current);
      mainButtonHandler.current = null;
    }
    mb.hide();
  }, [webApp]);

  const showBackButton = useCallback(
    (onClick: () => void) => {
      const bb = webApp?.BackButton;
      if (!bb) return;
      if (backButtonHandler.current) bb.offClick(backButtonHandler.current);
      backButtonHandler.current = onClick;
      bb.onClick(onClick);
      bb.show();
    },
    [webApp],
  );

  const hideBackButton = useCallback(() => {
    const bb = webApp?.BackButton;
    if (!bb) return;
    if (backButtonHandler.current) {
      bb.offClick(backButtonHandler.current);
      backButtonHandler.current = null;
    }
    bb.hide();
  }, [webApp]);

  const telegramUser = useMemo(() => mapUser(webApp), [webApp]);

  const value = useMemo<TelegramContextValue>(
    () => ({
      webApp,
      isInsideTelegram: Boolean(webApp && webApp.initData),
      isReady,
      initData: webApp?.initData ?? "",
      initDataUnsafe: webApp?.initDataUnsafe ?? null,
      user: telegramUser ?? DEMO_USER,
      telegramUser,
      colorScheme,
      themeParams,
      version: webApp?.version ?? "0.0",
      platform: webApp?.platform ?? "unknown",
      viewport,
      ready,
      expand,
      haptic,
      hapticSuccess,
      hapticSelection,
      setClosingConfirmation,
      showMainButton,
      hideMainButton,
      showBackButton,
      hideBackButton,
    }),
    [
      webApp,
      isReady,
      telegramUser,
      colorScheme,
      themeParams,
      viewport,
      ready,
      expand,
      haptic,
      hapticSuccess,
      hapticSelection,
      setClosingConfirmation,
      showMainButton,
      hideMainButton,
      showBackButton,
      hideBackButton,
    ],
  );

  return (
    <TelegramContext.Provider value={value}>
      {children}
    </TelegramContext.Provider>
  );
}

export function useTelegram() {
  const ctx = useContext(TelegramContext);
  if (!ctx) throw new Error("useTelegram must be used within TelegramProvider");
  return ctx;
}

/**
 * Declaratively bind the native Telegram BackButton to a route/handler.
 * Shows it while `visible`, routes taps to `onBack`, and cleans up on unmount.
 */
export function useTelegramBackButton(visible: boolean, onBack: () => void) {
  const { showBackButton, hideBackButton } = useTelegram();
  const cb = useRef(onBack);
  cb.current = onBack;

  useEffect(() => {
    if (visible) showBackButton(() => cb.current());
    else hideBackButton();
    return () => hideBackButton();
  }, [visible, showBackButton, hideBackButton]);
}

/**
 * Declaratively bind the native Telegram MainButton. Pass `null` to hide it.
 * The handler is read through a ref so re-renders don't detach/reattach it.
 */
export function useTelegramMainButton(
  config: { text: string; onClick: () => void; enabled?: boolean } | null,
) {
  const { showMainButton, hideMainButton } = useTelegram();
  const cb = useRef<(() => void) | null>(config?.onClick ?? null);
  cb.current = config?.onClick ?? null;

  const text = config?.text;
  const enabled = config?.enabled ?? true;

  useEffect(() => {
    if (text) {
      showMainButton({ text, enabled, onClick: () => cb.current?.() });
    } else {
      hideMainButton();
    }
    return () => hideMainButton();
  }, [text, enabled, showMainButton, hideMainButton]);
}
