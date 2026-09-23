"use client";

import { usePathname } from "next/navigation";
import { EmployeeBootGate } from "@/components/employee-boot-gate";

/**
 * Wraps employee (Telegram Mini App) routes in the mobile `.app-shell`
 * (max-width 480px column) but lets the desktop web control portal render
 * full-width. `/control`, `/admin/*`, `/spm/*` are the desktop-first control
 * area; everything else stays mobile-first. Keeps all URLs unchanged.
 *
 * Employee routes also pass through the EmployeeBootGate so a not-yet-resolved or
 * failed bootstrap shows a loader / recoverable retry instead of a black screen.
 * The control area has its own portal guards and is not gated here.
 */
const FULL_WIDTH_PREFIXES = ["/control", "/admin", "/spm"];

export function AppShellFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (FULL_WIDTH_PREFIXES.some((p) => pathname?.startsWith(p))) return <>{children}</>;
  return (
    <div className="app-shell">
      <EmployeeBootGate>{children}</EmployeeBootGate>
    </div>
  );
}
