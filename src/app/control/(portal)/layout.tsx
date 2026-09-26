import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/server/session";
import { canAccessControl } from "@/lib/roles";
import { hasSystemAccessForUser } from "@/lib/server/authz";
import { getActorContext } from "@/lib/server/rbac/context";
import { hasActiveRole } from "@/lib/server/rbac/scope-core";
import { resolveViewContext } from "@/lib/server/rbac/view-as";
import { ControlShell } from "@/components/control/ControlShell";
import { AccessDenied } from "@/components/control/AccessDenied";

export const metadata: Metadata = { title: "METRO UP Control" };
export const dynamic = "force-dynamic";

/**
 * Web control portal gate. Access = SPM, ADMIN, CLUB_MANAGER (canAccessControl
 * — untouched legacy check) OR an active PROJECT_ADMIN/CITY_MANAGER/
 * OPERATIONS_DIRECTOR/CLUB_MANAGER RoleAssignment (Sprint 1 / Phase 2B, and
 * Sprint: role-cabinets step 6 adds the CLUB_MANAGER grant to this list —
 * without it, a CITY_MANAGER-assigned CLUB_MANAGER with no elevated legacy
 * AppRole would be turned away at this outer gate before ever reaching
 * /control/club, exactly the same gap the original PROJECT_ADMIN/
 * CITY_MANAGER/OPERATIONS_DIRECTOR grants were added to close). Unauthenticated
 * users get a login link. All business APIs remain independently guarded
 * server-side regardless of what this layout decides to render.
 */
export default async function ControlPortalLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/control/login"); // unauthenticated → login

  const systemAccess = await hasSystemAccessForUser(user);
  const actor = await getActorContext(user);
  const isCityManager = hasActiveRole(actor.grants, "CITY_MANAGER");
  const isOperationsDirector = hasActiveRole(actor.grants, "OPERATIONS_DIRECTOR");
  const isClubManager = hasActiveRole(actor.grants, "CLUB_MANAGER");

  if (!canAccessControl(user.role) && !systemAccess && !isCityManager && !isOperationsDirector && !isClubManager) {
    return <AccessDenied message="У вас нет доступа к панели управления." />;
  }

  const viewCtx = await resolveViewContext(user);
  return (
    <ControlShell
      displayName={user.displayName}
      role={user.role}
      hasSystemAccess={systemAccess}
      isCityManager={isCityManager}
      isOperationsDirector={isOperationsDirector}
      isClubManager={isClubManager}
      viewContext={viewCtx ? { previewRole: viewCtx.previewRole } : null}
    >
      {children}
    </ControlShell>
  );
}
