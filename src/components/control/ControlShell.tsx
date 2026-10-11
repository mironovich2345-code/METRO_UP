"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowLeft,
  BarChart3,
  BookOpen,
  Bot,
  Building2,
  ChevronDown,
  ClipboardList,
  Eye,
  Globe2,
  GraduationCap,
  Home,
  KeyRound,
  ListChecks,
  LogOut,
  ScrollText,
  Trophy,
  UserCog,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import type { AppRole } from "@prisma/client";
import { cn } from "@/lib/utils";
import { ThemeSegmented, ThemeSwitcher } from "@/components/ui/theme-switcher";
import {
  buildControlNav,
  describeControlNavSelector,
  resolveActiveControlNavItem,
  type ControlNavGroup,
  type ControlNavIcon,
} from "@/lib/control/control-nav";
import { ViewAsBanner } from "./ViewAsBanner";

const NAV_ICON: Record<ControlNavIcon, LucideIcon> = {
  home: Home,
  learning: GraduationCap,
  scripts: ScrollText,
  instructions: BookOpen,
  metric: Bot,
  users: UserCog,
  roles: KeyRound,
  club: ClipboardList,
  plan: ListChecks,
  team: Users,
  city: Building2,
  network: Globe2,
  sales: BarChart3,
  mystery: Eye,
  rating: Trophy,
};

const ROLE_LABEL: Record<string, string> = { ADMIN: "Администратор", SPM: "СПМ", CLUB_MANAGER: "Управляющий" };

export interface ViewContextInfo {
  previewRole: string;
}

/**
 * Single desktop web shell for the whole control portal (/control, /admin/*,
 * /spm/*). One sidebar, role-based nav — the user never feels like they moved
 * between two products. Access itself is enforced server-side per layout.
 *
 * `hasSystemAccess` / `isCityManager` / `isOperationsDirector` (Sprint 1 /
 * Phase 2B) are computed ONCE server-side by the calling layout (via
 * hasSystemAccessForUser() / getActorContext() + hasActiveRole()) and passed
 * down as plain booleans — never recomputed from `role` alone here, which
 * only knows the LEGACY AppRole axis and would miss anyone whose authority
 * comes from a RoleAssignment instead.
 */
export function ControlShell({
  displayName,
  role,
  hasSystemAccess,
  isCityManager = false,
  isOperationsDirector = false,
  isClubManager = false,
  viewContext = null,
  children,
}: {
  displayName: string;
  role: AppRole;
  hasSystemAccess: boolean;
  isCityManager?: boolean;
  isOperationsDirector?: boolean;
  /** Sprint: role-cabinets, step 6 — an active CLUB_MANAGER RoleAssignment
   * grant, independent of the legacy canManageClub(role) check below (which
   * only sees legacy AppRole=CLUB_MANAGER/ADMIN). Either one shows the
   * "Управляющий" cabinet link. */
  isClubManager?: boolean;
  viewContext?: ViewContextInfo | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const isAdmin = hasSystemAccess;

  // QA-05 — one grouped model for the sidebar and the mobile sheet; the
  // visibility conditions are the same ones this list always used.
  const groups = buildControlNav({ role, hasSystemAccess: isAdmin, isClubManager, isCityManager, isOperationsDirector });
  const selector = describeControlNavSelector(groups, pathname);
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = useCallback(() => setMenuOpen(false), []);

  const logout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
    } finally {
      router.push("/control/login");
    }
  };

  return (
    <>
      {viewContext && <ViewAsBanner previewRole={viewContext.previewRole} realRoleLabel={ROLE_LABEL[role] ?? role} />}
      <div className="flex min-h-[100dvh] bg-background text-foreground">
      <aside className="sticky top-0 hidden h-[100dvh] w-64 shrink-0 grow-0 basis-64 flex-col border-r border-border bg-card px-4 py-6 md:flex">
        <Link href="/control" className="flex items-center gap-2 px-2">
          <span className="flex size-9 items-center justify-center rounded-xl bg-brand text-brand-foreground font-black">M</span>
          <div className="leading-tight">
            <p className="text-sm font-bold">METRO UP Control</p>
            <p className="text-xs text-muted-foreground">Панель управления</p>
          </div>
        </Link>

        <nav className="mt-8 flex min-h-0 flex-col gap-4 overflow-y-auto" aria-label="Разделы">
          <ControlNavGroups groups={groups} pathname={pathname} />
        </nav>

        <div className="mt-auto">
          <div className="mb-3">
            <p className="mb-1.5 px-1 text-xs font-medium text-muted-foreground">Тема оформления</p>
            <ThemeSegmented />
          </div>
          <Link
            href="/home"
            className="mb-2 flex w-full items-center gap-2 rounded-2xl border border-border px-3 py-2.5 text-sm font-medium text-foreground hover:bg-muted"
          >
            <ArrowLeft className="size-4" /> Вернуться в METRO UP
          </Link>
          <div className="rounded-2xl bg-muted px-3 py-2.5 text-xs">
            <p className="font-semibold text-foreground">{displayName}</p>
            <p className="text-muted-foreground">{ROLE_LABEL[role] ?? role}</p>
          </div>
          <button
            onClick={logout}
            className="mt-2 flex w-full items-center gap-2 rounded-2xl px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted"
          >
            <LogOut className="size-4" /> Выйти
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        {/* Mobile top bar — the sidebar is desktop-only, so phones (incl. Telegram
            WebView) need a visible return path + navigation here. */}
        <div className="sticky top-0 z-30 border-b border-border bg-card/90 backdrop-blur md:hidden">
          <div className="flex items-center justify-between gap-2 px-4 py-3">
            <Link href="/home" className="flex items-center gap-1.5 rounded-2xl border border-border px-3 py-2 text-sm font-semibold">
              <ArrowLeft className="size-4" /> METRO UP
            </Link>
            <span className="truncate text-xs font-medium text-muted-foreground">{ROLE_LABEL[role] ?? role}</span>
            <div className="flex shrink-0 items-center gap-2">
              <ThemeSwitcher className="size-9" />
              <button onClick={logout} aria-label="Выйти" className="flex size-9 items-center justify-center rounded-2xl border border-border text-muted-foreground">
                <LogOut className="size-4" />
              </button>
            </div>
          </div>
          {/* QA-05 — no more sideways-scrolling strip of 10–15 tabs: one
              full-width «Разделы» button that always names the current
              section and opens the grouped list. */}
          <div className="px-4 pb-3">
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={menuOpen}
              aria-label={selector.ariaLabel}
              className="flex min-h-11 w-full items-center gap-2 rounded-2xl border border-border bg-background px-4 py-2 text-left"
            >
              {/* QA-05.2 — ONLY the current section. The group is not repeated
                  here: the sheet this opens shows the groups itself. */}
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{selector.label}</span>
              <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            </button>
          </div>
        </div>

        <div className="mx-auto w-full max-w-[1440px] px-5 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</div>
        {/* Rendered OUTSIDE the sticky header on purpose: its backdrop-blur
            would become the containing block of a position:fixed sheet. */}
        {menuOpen && <ControlSectionsSheet groups={groups} pathname={pathname} onClose={closeMenu} />}
      </main>
      </div>
    </>
  );
}

/** The grouped nav list — shared by the desktop sidebar and the mobile sheet. */
function ControlNavGroups({
  groups,
  pathname,
  onNavigate,
  size = "md",
}: {
  groups: ControlNavGroup[];
  pathname: string | null;
  onNavigate?: () => void;
  size?: "md" | "lg";
}) {
  const active = resolveActiveControlNavItem(groups, pathname);
  return (
    <>
      {groups.map((group) => (
        <div key={group.id} className="flex flex-col gap-1">
          {group.title && <p className="px-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">{group.title}</p>}
          {group.items.map((item) => {
            const isActive = active?.href === item.href;
            const Icon = NAV_ICON[item.icon];
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-2xl px-3 font-medium transition-colors",
                  size === "lg" ? "min-h-12 py-3 text-[15px]" : "py-2.5 text-sm",
                  isActive ? "bg-brand/12 text-foreground" : "text-muted-foreground hover:bg-muted",
                )}
              >
                <Icon className={cn("size-4 shrink-0", isActive && "text-brand")} />
                <span className="min-w-0 [overflow-wrap:anywhere]">{item.label}</span>
              </Link>
            );
          })}
        </div>
      ))}
    </>
  );
}

/** QA-05 — mobile «Разделы»: a bottom sheet with every section the actor
 * may open, grouped, the current one highlighted. Esc / backdrop / a link
 * closes it; the page behind does not scroll while it is open. */
function ControlSectionsSheet({ groups, pathname, onClose }: { groups: ControlNavGroup[]; pathname: string | null; onClose: () => void }) {
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 md:hidden">
      <div className="absolute inset-0 bg-black/45" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Разделы"
        className="absolute inset-x-0 bottom-0 flex max-h-[85dvh] flex-col rounded-t-3xl border-t border-border bg-card pb-[calc(env(safe-area-inset-bottom)+12px)]"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 px-5 pt-4 pb-2">
          <h2 className="text-lg font-bold">Разделы</h2>
          <button type="button" onClick={onClose} aria-label="Закрыть" className="flex size-11 items-center justify-center rounded-full text-muted-foreground hover:bg-muted">
            <X className="size-5" />
          </button>
        </div>
        <nav className="flex min-h-0 flex-col gap-4 overflow-y-auto overscroll-contain px-3 pb-2" aria-label="Разделы">
          <ControlNavGroups groups={groups} pathname={pathname} onNavigate={onClose} size="lg" />
        </nav>
      </div>
    </div>
  );
}
