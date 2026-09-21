import { getCurrentUser } from "@/lib/server/session";
import { hasSystemAccessForUser } from "@/lib/server/authz";
import { getActorContext } from "@/lib/server/rbac/context";
import { hasActiveRole } from "@/lib/server/rbac/scope-core";
import { ControlDashboard } from "@/components/control/ControlDashboard";

export const dynamic = "force-dynamic";

/** Control dashboard — the layout already guarantees a valid control-portal session. */
export default async function ControlHomePage() {
  const user = await getCurrentUser();
  if (!user) return null; // guarded by layout; satisfies types
  const systemAccess = await hasSystemAccessForUser(user);
  const actor = await getActorContext(user);
  const isCityManager = hasActiveRole(actor.grants, "CITY_MANAGER");
  const isOperationsDirector = hasActiveRole(actor.grants, "OPERATIONS_DIRECTOR");
  return (
    <ControlDashboard
      displayName={user.displayName}
      role={user.role}
      hasSystemAccess={systemAccess}
      isCityManager={isCityManager}
      isOperationsDirector={isOperationsDirector}
    />
  );
}
