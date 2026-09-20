import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/server/session";
import { canAccessControl } from "@/lib/roles";
import { hasSystemAccessForUser } from "@/lib/server/authz";
import { ControlShell } from "@/components/control/ControlShell";
import { AccessDenied } from "@/components/control/AccessDenied";

export const metadata: Metadata = { title: "METRO UP Control" };
export const dynamic = "force-dynamic";

/**
 * Web control portal gate. Access = SPM, ADMIN or CLUB_MANAGER (canAccessControl
 * — untouched legacy check, this outer gate is not CMS-specific). Unauthenticated
 * users get a login link. All business APIs remain independently guarded
 * server-side. `hasSystemAccess` is computed once here and passed to
 * ControlShell purely for CMS nav-item visibility (Sprint 1 / Phase 2B).
 */
export default async function ControlPortalLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/control/login"); // unauthenticated → login
  if (!canAccessControl(user.role)) {
    return <AccessDenied message="У вас нет доступа к панели управления." />;
  }
  const systemAccess = await hasSystemAccessForUser(user);
  return (
    <ControlShell displayName={user.displayName} role={user.role} hasSystemAccess={systemAccess}>
      {children}
    </ControlShell>
  );
}
