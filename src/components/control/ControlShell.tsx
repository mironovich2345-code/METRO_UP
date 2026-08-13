"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  Eye,
  GraduationCap,
  Home,
  Image as ImageIcon,
  LogOut,
  Trophy,
} from "lucide-react";
import type { AppRole } from "@prisma/client";
import { canAccessAdmin } from "@/lib/roles";
import { cn } from "@/lib/utils";

const ROLE_LABEL: Record<string, string> = { ADMIN: "Администратор", SPM: "СПМ" };

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
          { href: "/admin/media", label: "Медиа", icon: ImageIcon, exact: false },
        ]
      : []),
    { href: "/spm/sales", label: "Продажи", icon: BarChart3, exact: false },
    { href: "/spm/mystery", label: "Тайный покупатель", icon: Eye, exact: false },
    { href: "/spm/rating", label: "Рейтинг", icon: Trophy, exact: false },
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
      <aside className="sticky top-0 hidden h-[100dvh] w-60 shrink-0 flex-col border-r border-border bg-card px-4 py-6 md:flex">
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
        <div className="mx-auto max-w-6xl px-6 py-8">{children}</div>
      </main>
    </div>
  );
}
