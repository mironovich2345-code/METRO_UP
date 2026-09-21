import { getCurrentUser } from "@/lib/server/session";
import { getActorContext } from "@/lib/server/rbac/context";
import { hasNetworkAccess } from "@/lib/server/rbac/authorize-core";
import { AccessDenied } from "@/components/control/AccessDenied";
import { NetworkTree } from "@/components/control/NetworkTree";

export const dynamic = "force-dynamic";

/** "Сеть" — SYSTEM access or OPERATIONS_DIRECTOR only (Sprint 1 / Phase 2B). */
export default async function ControlNetworkPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  const actor = await getActorContext(user);
  if (!hasNetworkAccess(actor)) {
    return <AccessDenied message="Раздел «Сеть» доступен Операционному директору." />;
  }
  return <NetworkTree />;
}
