"use client";

import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/telegram";
import { ThemeSwitcher } from "@/components/ui/theme-switcher";
import { useTelegramBackButton } from "@/providers/TelegramProvider";

interface AppHeaderProps {
  title?: string;
  subtitle?: string;
  showBack?: boolean;
  /**
   * Deterministic back target. When set, Back navigates here (via router.push)
   * instead of router.back() — so a direct deep-link never dead-ends. The same
   * handler is bound to the Telegram native BackButton, so both controls behave
   * identically (native + in-page fallback, one behaviour).
   */
  backHref?: string;
  showThemeSwitcher?: boolean;
  /** Content rendered on the leading side (e.g. an avatar block). */
  leading?: React.ReactNode;
  /** Extra trailing controls, placed before the theme switcher. */
  trailing?: React.ReactNode;
  className?: string;
  /** Sticky + blurred header that floats over scrolling content. */
  sticky?: boolean;
}

export function AppHeader({
  title,
  subtitle,
  showBack,
  backHref,
  showThemeSwitcher = true,
  leading,
  trailing,
  className,
  sticky,
}: AppHeaderProps) {
  const router = useRouter();

  const goBack = () => {
    haptic("light");
    if (backHref) router.push(backHref);
    else router.back();
  };

  // Bind the Telegram native BackButton to the SAME action while a back control
  // is shown. Outside Telegram this is a no-op; the in-page button still works.
  useTelegramBackButton(Boolean(showBack), goBack);

  return (
    <header
      className={cn(
        "z-30 flex items-center gap-3 px-5 pb-3 pt-[calc(env(safe-area-inset-top)+14px)]",
        sticky &&
          "sticky top-0 border-b border-border/60 bg-background/80 backdrop-blur-xl",
        className,
      )}
    >
      {showBack && (
        <motion.button
          type="button"
          whileTap={{ scale: 0.9 }}
          onClick={goBack}
          className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-border bg-card text-foreground"
          aria-label="Назад"
        >
          <ChevronLeft className="size-5" />
        </motion.button>
      )}

      {leading}

      {(title || subtitle) && (
        <div className="min-w-0 flex-1">
          {subtitle && (
            <p className="truncate text-xs font-medium text-muted-foreground">
              {subtitle}
            </p>
          )}
          {title && (
            <h1 className="truncate text-lg font-bold tracking-tight text-foreground">
              {title}
            </h1>
          )}
        </div>
      )}

      {!title && !subtitle && !leading && <div className="flex-1" />}

      <div className="flex shrink-0 items-center gap-2">
        {trailing}
        {showThemeSwitcher && <ThemeSwitcher />}
      </div>
    </header>
  );
}
