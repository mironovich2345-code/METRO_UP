"use client";

import { usePathname } from "next/navigation";

/**
 * Wraps employee routes in the mobile `.app-shell` (max-width 480px column) but
 * lets the ADMIN CMS (`/admin`) render full-width as a desktop-first web app.
 * Keeps all existing employee routes and URLs unchanged.
 */
const FULL_WIDTH_PREFIXES = ["/admin", "/spm"];

export function AppShellFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (FULL_WIDTH_PREFIXES.some((p) => pathname?.startsWith(p))) return <>{children}</>;
  return <div className="app-shell">{children}</div>;
}
