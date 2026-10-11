"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { Building2, GraduationCap, Home, Library, ListChecks, MessageSquare, Trophy, Users, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { hapticSelection } from "@/lib/telegram";
import { visibleBottomNavRoutes, isActiveNavRoute, isSameRouteNavTap, applyNavTap, resolveEffectiveNavContext, type BottomNavRoute, type ManagementNavContext } from "@/lib/nav-items";
import { MetricCharacter } from "@/components/ui/metric-character";
import { useApp } from "@/providers/app-provider";
import { useAppUser } from "@/providers/AppUserProvider";
import { loadStoredContext, onStoredContextChanged } from "@/lib/home-context-storage";
import { getOwnerKey } from "@/lib/client/owner";

const ICONS: Record<string, LucideIcon> = {
  "/home": Home,
  "/academy": GraduationCap,
  "/knowledge": Library,
  "/ranking": Trophy,
  "/team": Users,
  "/plan": ListChecks,
  "/city": Building2,
  "/questions": MessageSquare,
};

/**
 * Management UX Round A, section 4 — `loadStoredContext` is a synchronous
 * localStorage read (home-context-storage.ts), but it must still run only
 * client-side, after mount (never during the server-rendered first pass,
 * which has no localStorage) — the exact same `undefined` → resolved
 * pattern Home's own `requestedContext` and Academy's `sectionKey` already
 * use for this identical API. While unresolved, `null` deliberately
 * resolves to "PERSONAL" (resolveEffectiveNavContext's own default) — the
 * SAME 5-item bar that already renders unconditionally today, so there is
 * no flash-of-wrong-content window for the one context (PERSONAL) most
 * users have.
 *
 * Round A.1, section A — exported so a page can decide ITS OWN presentation
 * (e.g. whether to show an avatar/Profile entry, whether to render
 * BottomNavigation at all) from the exact same resolved context the nav
 * bar itself uses, without re-deriving it a second, possibly-divergent way.
 *
 * Round B.1, section 2 (P0/P1 fix) — root cause of "stale nav after
 * returning from View As": this hook used to read storage ONCE, on mount,
 * and never again. BottomNavigation stays MOUNTED across a View-As end on
 * Home (it's a data refetch, not a navigation — no remount), so its
 * one-time read never saw Home's later, corrected `saveStoredContext`
 * call; only an actual route change (a fresh mount elsewhere) happened to
 * pick it up, which is exactly the "navigating to /city fixes it" symptom
 * observed live. Fixed by also subscribing to onStoredContextChanged
 * (home-context-storage.ts) for the lifetime of this hook — a same-tab,
 * event-driven re-read with no polling and no race (the event fires
 * synchronously at the moment of the write, not before).
 *
 * Sprint: LIVE QA FIX QA-01B — root cause of the WRONG-ROLE BAR flashed on
 * every same-role tab switch. BottomNavigation is rendered inside each page,
 * so it remounts on every navigation — and this hook used to start at
 * `useState(null)`, reading storage only in a post-paint useEffect. Every
 * remount's FIRST painted frame therefore resolved `null` -> "PERSONAL": a
 * CLUB_MANAGER/CITY_MANAGER saw the 5-tab PERSONAL bar (raised Метрик
 * circle and all) on each tab switch, then the 4-tab management bar one
 * frame later. The same hook drives /academy's avatar and /plan's
 * header/back button (and, through AppHeader, Telegram's NATIVE
 * BackButton), which blinked the same way.
 *
 * Now read with useSyncExternalStore over the SAME storage + change event:
 * a client mount reads the real value on its very first render (no null
 * frame), and the onStoredContextChanged subscription still lives for the
 * component's whole lifetime (Round B.1's fix, unchanged in behavior).
 * `getServerSnapshot` returns null, so a server/hydration render keeps the
 * old PERSONAL default instead of touching localStorage — in practice never
 * exercised (every page that renders this is behind EmployeeBootGate, whose
 * server render is always its own loader), but it keeps this hook safe if
 * that ever changes. The snapshot is a primitive (string|null), so repeated
 * reads compare equal and never trigger a spurious re-render.
 */
const subscribeStoredContext = (onStoreChange: () => void) => onStoredContextChanged(onStoreChange);
const readStoredContextType = () => loadStoredContext(getOwnerKey())?.type ?? null;
const readStoredContextTypeOnServer = () => null;

export function useEffectiveNavContext(): ManagementNavContext {
  const { user } = useAppUser();
  const storedType = useSyncExternalStore(subscribeStoredContext, readStoredContextType, readStoredContextTypeOnServer);
  return resolveEffectiveNavContext({ storedContextType: storedType, previewRole: user?.viewContext?.previewRole ?? null });
}

export function BottomNavigation() {
  const pathname = usePathname() ?? "";
  const { profile } = useApp();
  const effectiveContext = useEffectiveNavContext();
  const routes = visibleBottomNavRoutes(profile?.accessStatus, effectiveContext);

  return (
    <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center pb-[calc(env(safe-area-inset-bottom)+12px)]">
      {/* overflow-visible so the raised Метрик button (and the mascot's marker) is never clipped */}
      <div className="pointer-events-auto mx-3 flex w-full max-w-[460px] items-center justify-around overflow-visible rounded-[26px] border border-[var(--glass-border)] bg-[var(--glass-bg)] px-1.5 py-2 shadow-[var(--shadow-float)] backdrop-blur-2xl">
        {routes.map((item) => {
          const active = isActiveNavRoute(pathname, item);
          const isCurrentRoute = isSameRouteNavTap(pathname, item.href);
          return item.central ? (
            <MetricNavItem key={item.href} item={item} active={active} isCurrentRoute={isCurrentRoute} />
          ) : (
            <StandardNavItem key={item.href} item={item} active={active} isCurrentRoute={isCurrentRoute} />
          );
        })}
      </div>
    </nav>
  );
}

function StandardNavItem({ item, active, isCurrentRoute }: { item: BottomNavRoute; active: boolean; isCurrentRoute: boolean }) {
  const Icon = ICONS[item.href] ?? Home;
  return (
    <Link
      href={item.href}
      onClick={(e) => applyNavTap(e, isCurrentRoute, hapticSelection)}
      aria-current={isCurrentRoute ? "page" : undefined}
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
function MetricNavItem({ item, active, isCurrentRoute }: { item: BottomNavRoute; active: boolean; isCurrentRoute: boolean }) {
  return (
    <Link
      href={item.href}
      onClick={(e) => applyNavTap(e, isCurrentRoute, hapticSelection)}
      aria-current={isCurrentRoute ? "page" : undefined}
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
