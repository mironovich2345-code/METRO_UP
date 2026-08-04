"use client";

import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/telegram";
import { ThemeSwitcher } from "@/components/ui/theme-switcher";

interface AppHeaderProps {
  title?: string;
  subtitle?: string;
  showBack?: boolean;
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
  showThemeSwitcher = true,
  leading,
  trailing,
  className,
  sticky,
}: AppHeaderProps) {
  const router = useRouter();

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
          onClick={() => {
            haptic("light");
            router.back();
          }}
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
