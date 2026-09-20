"use client";

import { usePathname } from "next/navigation";
import { AccessStatusGate } from "@/components/access/AccessStatusGate";

/**
 * Wraps employee (Telegram Mini App) routes in the mobile `.app-shell`
 * (max-width 480px column) but lets the desktop web control portal render
 * full-width. `/control`, `/admin/*`, `/spm/*` are the desktop-first control
 * area; everything else stays mobile-first. Keeps all URLs unchanged.
 *
 * The control/admin/spm portal is NOT wrapped in AccessStatusGate — its
 * access model is the legacy AppRole/RoleAssignment hierarchy (requireRole /
 * requireSystemAccess / authorize()), not EmployeeProfile.accessStatus, and
 * its actors (CLUB_MANAGER/SPM/ADMIN/PROJECT_ADMIN) typically carry no
 * EmployeeProfile at all — see authz.ts's requireActiveAccess doc comment.
 */
const FULL_WIDTH_PREFIXES = ["/control", "/admin", "/spm"];

export function AppShellFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (FULL_WIDTH_PREFIXES.some((p) => pathname?.startsWith(p))) return <>{children}</>;
  return (
    <div className="app-shell">
      <AccessStatusGate>{children}</AccessStatusGate>
    </div>
  );
}
