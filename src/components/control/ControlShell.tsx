"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowLeft,
  BarChart3,
  BookOpen,
  Eye,
  GraduationCap,
  Home,
  ListChecks,
  LogOut,
  ScrollText,
  Trophy,
  UserCog,
  Users,
} from "lucide-react";
import type { AppRole } from "@prisma/client";
import { canAccessAdmin, canAccessSpm, canManageClub } from "@/lib/roles";
import { cn } from "@/lib/utils";
import { ThemeSegmented, ThemeSwitcher } from "@/components/ui/theme-switcher";

const ROLE_LABEL: Record<string, string> = { ADMIN: "Администратор", SPM: "СПМ", CLUB_MANAGER: "Управляющий" };

/**
 * Single desktop web shell for the whole control portal (/control, /admin/*,
 * /spm/*). One sidebar, role-based nav — the user never feels like they moved
 * between two products. Access itself is enforced server-side per layout.
 */
export function ControlShell({
  displayName,
  role,
  children,
}: {
  displayName: string;
  role: AppRole;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const isAdmin = canAccessAdmin(role);

  const nav = [
    { href: "/control", label: "Главная", icon: Home, exact: true },
    ...(isAdmin
      ? [
          { href: "/admin/content", label: "Обучение", icon: GraduationCap, exact: false },
          { href: "/control/scripts", label: "Скрипты", icon: ScrollText, exact: false },
          { href: "/control/instructions", label: "Инструкции", icon: BookOpen, exact: false },
          { href: "/control/users", label: "Сотрудники", icon: UserCog, exact: false },
        ]
      : []),
    ...(canManageClub(role)
      ? [
          { href: "/control/plan", label: "План дня", icon: ListChecks, exact: false },
          { href: "/control/team", label: "Команда", icon: Users, exact: false },
        ]
      : []),
    ...(canAccessSpm(role)
      ? [
          { href: "/spm/sales", label: "Продажи", icon: BarChart3, exact: false },
          { href: "/spm/mystery", label: "Тайный покупатель", icon: Eye, exact: false },
          { href: "/spm/rating", label: "Рейтинг", icon: Trophy, exact: false },
        ]
      : []),
  ];

  const logout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
    } finally {
      router.push("/control/login");
    }
  };

  return (
    <div className="flex min-h-[100dvh] bg-background text-foreground">
      <aside className="sticky top-0 hidden h-[100dvh] w-64 shrink-0 grow-0 basis-64 flex-col border-r border-border bg-card px-4 py-6 md:flex">
        <Link href="/control" className="flex items-center gap-2 px-2">
          <span className="flex size-9 items-center justify-center rounded-xl bg-brand text-brand-foreground font-black">M</span>
          <div className="leading-tight">
            <p className="text-sm font-bold">METRO UP Control</p>
            <p className="text-xs text-muted-foreground">Панель управления</p>
          </div>
        </Link>

        <nav className="mt-8 flex flex-col gap-1">
          {nav.map((item) => {
            const active = item.exact ? pathname === item.href : pathname?.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition-colors",
                  active ? "bg-brand/12 text-foreground" : "text-muted-foreground hover:bg-muted",
                )}
              >
                <Icon className={cn("size-4", active && "text-brand")} />
                {item.label}
              </Link>
            );
          })}
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
          <nav className="flex gap-1 overflow-x-auto px-4 pb-2.5">
            {nav.map((item) => {
              const active = item.exact ? pathname === item.href : pathname?.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "shrink-0 rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                    active ? "bg-brand/12 text-brand" : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="mx-auto w-full max-w-[1440px] px-5 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</div>
      </main>
    </div>
  );
}
