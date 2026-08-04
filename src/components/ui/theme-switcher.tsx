"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme, type ThemeMode } from "@/providers/theme-provider";
import { hapticSelection } from "@/lib/telegram";

/** Compact icon toggle — flips between light and dark. */
export function ThemeSwitcher({ className }: { className?: string }) {
  const { resolved, toggle } = useTheme();
  const isDark = resolved === "dark";

  return (
    <motion.button
      type="button"
      onClick={() => {
        hapticSelection();
        toggle();
      }}
      whileTap={{ scale: 0.92 }}
      className={cn(
        "relative flex size-11 items-center justify-center rounded-2xl border border-border bg-card text-foreground",
        className,
      )}
      aria-label={isDark ? "Светлая тема" : "Тёмная тема"}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={isDark ? "moon" : "sun"}
          initial={{ y: 8, opacity: 0, rotate: -30 }}
          animate={{ y: 0, opacity: 1, rotate: 0 }}
          exit={{ y: -8, opacity: 0, rotate: 30 }}
          transition={{ duration: 0.2 }}
        >
          {isDark ? (
            <Moon className="size-5" />
          ) : (
            <Sun className="size-5" />
          )}
        </motion.span>
      </AnimatePresence>
    </motion.button>
  );
}

const OPTIONS: { mode: ThemeMode; label: string; icon: typeof Sun }[] = [
  { mode: "light", label: "Светлая", icon: Sun },
  { mode: "system", label: "Система", icon: Monitor },
  { mode: "dark", label: "Тёмная", icon: Moon },
];

/** Three-way segmented control for a settings surface. */
export function ThemeSegmented({ className }: { className?: string }) {
  const { mode, setMode } = useTheme();

  return (
    <div
      className={cn(
        "relative grid grid-cols-3 gap-1 rounded-2xl bg-muted p-1",
        className,
      )}
    >
      {OPTIONS.map((opt) => {
        const active = mode === opt.mode;
        const Icon = opt.icon;
        return (
          <button
            key={opt.mode}
            type="button"
            onClick={() => {
              hapticSelection();
              setMode(opt.mode);
            }}
            className="relative z-10 flex h-10 items-center justify-center gap-1.5 rounded-xl text-sm font-medium"
          >
            {active && (
              <motion.span
                layoutId="theme-seg-thumb"
                className="absolute inset-0 -z-10 rounded-xl bg-card shadow-[var(--shadow-sm)]"
                transition={{ type: "spring", stiffness: 400, damping: 34 }}
              />
            )}
            <Icon
              className={cn(
                "size-4",
                active ? "text-foreground" : "text-muted-foreground",
              )}
            />
            <span
              className={cn(
                active ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {opt.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
