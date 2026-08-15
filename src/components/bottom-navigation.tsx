"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  GraduationCap,
  Home,
  Library,
  Trophy,
  User,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { hapticSelection } from "@/lib/telegram";
import { BOTTOM_NAV_ROUTES } from "@/lib/nav-items";

const ICONS: Record<string, LucideIcon> = {
  "/home": Home,
  "/academy": GraduationCap,
  "/knowledge": Library,
  "/ranking": Trophy,
  "/profile": User,
};

const NAV_ITEMS = BOTTOM_NAV_ROUTES.map((r) => ({ ...r, icon: ICONS[r.href] ?? Home }));

export function BottomNavigation() {
  const pathname = usePathname();

  return (
    <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center pb-[calc(env(safe-area-inset-bottom)+12px)]">
      <div className="pointer-events-auto mx-3 flex w-full max-w-[460px] items-center justify-around rounded-[26px] border border-[var(--glass-border)] bg-[var(--glass-bg)] px-1.5 py-2 shadow-[var(--shadow-float)] backdrop-blur-2xl">
        {NAV_ITEMS.map((item) => {
          const active =
            pathname === item.href ||
            pathname.startsWith(`${item.href}/`) ||
            (item.match?.some((p) => pathname === p || pathname.startsWith(`${p}/`)) ?? false);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => hapticSelection()}
              className="relative flex flex-1 flex-col items-center gap-1 py-1.5"
            >
              {active && (
                <motion.span
                  layoutId="nav-active-pill"
                  className="absolute inset-x-2 -top-0.5 bottom-0 -z-10 rounded-2xl bg-brand/12"
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                />
              )}
              <motion.span
                animate={{ scale: active ? 1.06 : 1, y: active ? -1 : 0 }}
                transition={{ type: "spring", stiffness: 500, damping: 28 }}
              >
                <Icon
                  className={cn(
                    "size-[22px] transition-colors",
                    active
                      ? "text-foreground"
                      : "text-muted-foreground",
                  )}
                  strokeWidth={active ? 2.4 : 2}
                />
              </motion.span>
              <span
                className={cn(
                  "whitespace-nowrap text-[10px] font-semibold leading-none transition-colors",
                  active ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
