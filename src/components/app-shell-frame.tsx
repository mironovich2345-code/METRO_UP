"use client";

import { usePathname } from "next/navigation";

/**
 * Wraps employee (Telegram Mini App) routes in the mobile `.app-shell`
 * (max-width 480px column) but lets the desktop web control portal render
 * full-width. `/control`, `/admin/*`, `/spm/*` are the desktop-first control
 * area; everything else stays mobile-first. Keeps all URLs unchanged.
 */
const FULL_WIDTH_PREFIXES = ["/control", "/admin", "/spm"];

export function AppShellFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (FULL_WIDTH_PREFIXES.some((p) => pathname?.startsWith(p))) return <>{children}</>;
  return <div className="app-shell">{children}</div>;
}
