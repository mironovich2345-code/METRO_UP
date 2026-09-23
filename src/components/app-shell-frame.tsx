"use client";

import { usePathname } from "next/navigation";
import { AccessStatusGate } from "@/components/access/AccessStatusGate";
import { ViewAsBanner } from "@/components/control/ViewAsBanner";
import { EmployeeBootGate } from "@/components/employee-boot-gate";
import { useAppUser } from "@/providers/AppUserProvider";

/**
 * Wraps employee (Telegram Mini App) routes in the mobile `.app-shell`
 * (max-width 480px column) but lets the desktop web control portal render
 * full-width. `/control`, `/admin/*`, `/spm/*` are the desktop-first control
 * area; everything else stays mobile-first. Keeps all URLs unchanged.
 *
 * The control/admin/spm portal is NOT wrapped in any of the three gates
 * below — its access model is the legacy AppRole/RoleAssignment hierarchy
 * (requireRole / requireSystemAccess / authorize()), not
 * EmployeeProfile.accessStatus, and its actors (CLUB_MANAGER/SPM/ADMIN/
 * PROJECT_ADMIN) typically carry no EmployeeProfile at all — see authz.ts's
 * requireActiveAccess doc comment. It has its own portal guards
 * (control/(portal)/layout.tsx).
 *
 * Employee routes pass through three gates, outermost first, each solving a
 * different problem and none replacing another:
 *  1. EmployeeBootGate (P0 black-screen fix) — resolves the bootstrap phase
 *     FIRST: loading → a real loader; error → a recoverable retry screen;
 *     ready → render everything below. Nothing past this point has a
 *     meaningful `user` yet while bootstrap hasn't settled, so it must sit
 *     outermost — a not-yet-resolved bootstrap has no identity for the View
 *     As banner or AccessStatusGate to act on regardless.
 *  2. ViewAsBanner (Sprint 1 / Phase 2D) — rendered whenever /api/auth/me's
 *     `viewContext` is set (a CITY_MANAGER's MANAGER/CLUB_MANAGER preview is
 *     active — see rbac/effective-context.ts). One banner here covers every
 *     Mini-App screen (Home, Academy, Knowledge, Ranking, Profile, …)
 *     without each needing its own check.
 *  3. AccessStatusGate — picks which screen renders based on
 *     EmployeeProfile.accessStatus (LIMITED/PENDING_APPROVAL/SUSPENDED).
 */
const FULL_WIDTH_PREFIXES = ["/control", "/admin", "/spm"];

export function AppShellFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, refresh } = useAppUser();
  if (FULL_WIDTH_PREFIXES.some((p) => pathname?.startsWith(p))) return <>{children}</>;
  return (
    <div className="app-shell">
      <EmployeeBootGate>
        {user?.viewContext && (
          <ViewAsBanner
            previewRole={user.viewContext.previewRole}
            realRoleLabel={user.viewContext.realRoleLabel}
            onEnded={() => void refresh()}
          />
        )}
        <AccessStatusGate>{children}</AccessStatusGate>
      </EmployeeBootGate>
    </div>
  );
}
