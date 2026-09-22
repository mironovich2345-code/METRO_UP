"use client";

import { usePathname } from "next/navigation";
import { AccessStatusGate } from "@/components/access/AccessStatusGate";
import { ViewAsBanner } from "@/components/control/ViewAsBanner";
import { useAppUser } from "@/providers/AppUserProvider";

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
 *
 * Sprint 1 / Phase 2D — this is also the ONE place the Mini App renders
 * ViewAsBanner, driven by /api/auth/me's `viewContext` (set only while a
 * CITY_MANAGER's MANAGER/CLUB_MANAGER preview is active — see
 * rbac/effective-context.ts). One banner here covers every Mini-App screen
 * (Home, Academy, Knowledge, Ranking, Profile, …) without each needing its
 * own check, exactly like AccessStatusGate already does for accessStatus.
 */
const FULL_WIDTH_PREFIXES = ["/control", "/admin", "/spm"];

export function AppShellFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, refresh } = useAppUser();
  if (FULL_WIDTH_PREFIXES.some((p) => pathname?.startsWith(p))) return <>{children}</>;
  return (
    <div className="app-shell">
      {user?.viewContext && (
        <ViewAsBanner
          previewRole={user.viewContext.previewRole}
          realRoleLabel={user.viewContext.realRoleLabel}
          onEnded={() => void refresh()}
        />
      )}
      <AccessStatusGate>{children}</AccessStatusGate>
    </div>
  );
}
