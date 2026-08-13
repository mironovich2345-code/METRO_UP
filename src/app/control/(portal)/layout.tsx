import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/server/session";
import { canAccessControl } from "@/lib/roles";
import { ControlShell } from "@/components/control/ControlShell";
import { AccessDenied } from "@/components/control/AccessDenied";

export const metadata: Metadata = { title: "METRO UP Control" };
export const dynamic = "force-dynamic";

/**
 * Web control portal gate. Access = SPM or ADMIN (canAccessSpm). Unauthenticated
 * or EMPLOYEE/CLUB_MANAGER get an access-denied screen with a login link. All
 * business APIs remain independently guarded server-side.
 */
export default async function ControlPortalLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/control/login"); // unauthenticated → login
  if (!canAccessControl(user.role)) {
    return <AccessDenied message="У вас нет доступа к панели управления." />;
  }
  return (
    <ControlShell displayName={user.displayName} role={user.role}>
      {children}
    </ControlShell>
  );
}
