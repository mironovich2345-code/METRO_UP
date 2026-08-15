"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { GraduationCap, Home, Library, Trophy, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { hapticSelection } from "@/lib/telegram";
import { BOTTOM_NAV_ROUTES, type BottomNavRoute } from "@/lib/nav-items";
import { MetricCharacter } from "@/components/ui/metric-character";

const ICONS: Record<string, LucideIcon> = {
  "/home": Home,
  "/academy": GraduationCap,
  "/knowledge": Library,
  "/ranking": Trophy,
};

function isActive(pathname: string, item: BottomNavRoute): boolean {
  return (
    pathname === item.href ||
    pathname.startsWith(`${item.href}/`) ||
    (item.match?.some((p) => pathname === p || pathname.startsWith(`${p}/`)) ?? false)
  );
}

export function BottomNavigation() {
  const pathname = usePathname() ?? "";

  return (
    <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center pb-[calc(env(safe-area-inset-bottom)+12px)]">
      {/* overflow-visible so the raised Метрик button (and the mascot's marker) is never clipped */}
      <div className="pointer-events-auto mx-3 flex w-full max-w-[460px] items-center justify-around overflow-visible rounded-[26px] border border-[var(--glass-border)] bg-[var(--glass-bg)] px-1.5 py-2 shadow-[var(--shadow-float)] backdrop-blur-2xl">
        {BOTTOM_NAV_ROUTES.map((item) => {
          const active = isActive(pathname, item);
          return item.central ? (
            <MetricNavItem key={item.href} item={item} active={active} />
          ) : (
            <StandardNavItem key={item.href} item={item} active={active} />
          );
        })}
      </div>
    </nav>
  );
}

function StandardNavItem({ item, active }: { item: BottomNavRoute; active: boolean }) {
  const Icon = ICONS[item.href] ?? Home;
  return (
    <Link
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
        <Icon className={cn("size-[22px] transition-colors", active ? "text-foreground" : "text-muted-foreground")} strokeWidth={active ? 2.4 : 2} />
      </motion.span>
      <span className={cn("whitespace-nowrap text-[10px] font-semibold leading-none transition-colors", active ? "text-foreground" : "text-muted-foreground")}>
        {item.label}
      </span>
    </Link>
  );
}

/**
 * The central «Метрик» action — a brand-accented circle raised above the bar,
 * holding the Metric mascot. The circle is overflow-visible with top headroom so
 * the mascot's marker/spark above its head is never clipped.
 */
function MetricNavItem({ item, active }: { item: BottomNavRoute; active: boolean }) {
  return (
    <Link
      href={item.href}
      onClick={() => hapticSelection()}
      aria-label="Метрик — ИИ-помощник"
      className="relative flex flex-1 flex-col items-center gap-1"
    >
      <motion.span
        whileTap={{ scale: 0.92 }}
        transition={{ type: "spring", stiffness: 480, damping: 30 }}
        className={cn(
          "relative -mt-8 flex size-14 items-center justify-center overflow-visible rounded-full border-2 shadow-[var(--shadow-float)] transition-colors",
          active ? "border-brand bg-brand/20" : "border-brand/60 bg-card",
        )}
      >
        {/* soft brand glow behind the mascot (blur extends past the circle) */}
        <span className="pointer-events-none absolute inset-0 -z-10 rounded-full bg-brand/25 blur-md" />
        <MetricCharacter size={38} animated={false} />
      </motion.span>
      <span className={cn("whitespace-nowrap text-[10px] font-bold leading-none transition-colors", active ? "text-brand" : "text-muted-foreground")}>
        {item.label}
      </span>
    </Link>
  );
}
