"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Eye, LayoutDashboard, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/spm", label: "Обзор", icon: LayoutDashboard, exact: true },
  { href: "/spm/sales", label: "Продажи", icon: BarChart3, exact: false },
  { href: "/spm/mystery", label: "Тайный покупатель", icon: Eye, exact: false },
  { href: "/spm/rating", label: "Рейтинг", icon: Trophy, exact: false },
];

export function SpmSidebar({ displayName, readonly }: { displayName: string; readonly: boolean }) {
  const pathname = usePathname();
  return (
    <aside className="sticky top-0 hidden h-[100dvh] w-60 shrink-0 flex-col border-r border-border bg-card px-4 py-6 md:flex">
      <div className="flex items-center gap-2 px-2">
        <span className="flex size-9 items-center justify-center rounded-xl bg-brand text-brand-foreground font-black">M</span>
        <div className="leading-tight">
          <p className="text-sm font-bold">Metro SPM</p>
          <p className="text-xs text-muted-foreground">Рейтинг и продажи</p>
        </div>
      </div>

      <nav className="mt-8 flex flex-col gap-1">
        {NAV.map((item) => {
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

      <div className="mt-auto rounded-2xl bg-muted px-3 py-2.5 text-xs text-muted-foreground">
        {readonly && <span className="mb-1 block font-semibold text-foreground">Режим только чтение (ADMIN)</span>}
        Вошли как <span className="font-semibold text-foreground">{displayName}</span>
      </div>
    </aside>
  );
}
