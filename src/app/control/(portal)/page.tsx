import { getCurrentUser } from "@/lib/server/session";
import { ControlDashboard } from "@/components/control/ControlDashboard";

export const dynamic = "force-dynamic";

/** Control dashboard — the layout already guarantees an ADMIN/SPM session. */
export default async function ControlHomePage() {
  const user = await getCurrentUser();
  if (!user) return null; // guarded by layout; satisfies types
  return <ControlDashboard displayName={user.displayName} role={user.role} />;
}
