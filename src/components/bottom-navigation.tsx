"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  GraduationCap,
  Home,
  Trophy,
  User,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { hapticSelection } from "@/lib/telegram";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/home", label: "Главная", icon: Home },
  { href: "/academy", label: "Академия", icon: GraduationCap },
  { href: "/ranking", label: "Рейтинг", icon: Trophy },
  { href: "/profile", label: "Профиль", icon: User },
];

export function BottomNavigation() {
  const pathname = usePathname();

  return (
    <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center pb-[calc(env(safe-area-inset-bottom)+12px)]">
      <div className="pointer-events-auto mx-4 flex w-full max-w-[440px] items-center justify-around rounded-[26px] border border-[var(--glass-border)] bg-[var(--glass-bg)] px-2 py-2 shadow-[var(--shadow-float)] backdrop-blur-2xl">
        {NAV_ITEMS.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
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
                  "text-[10px] font-semibold transition-colors",
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
