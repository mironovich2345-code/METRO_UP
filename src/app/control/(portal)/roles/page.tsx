import { getCurrentUser } from "@/lib/server/session";
import { hasSystemAccessForUser } from "@/lib/server/authz";
import { AccessDenied } from "@/components/control/AccessDenied";
import { RolesAdmin } from "@/components/control/RolesAdmin";

export const dynamic = "force-dynamic";

/** Role assignment administration — SYSTEM access only (Sprint 1 / Phase 2B). */
export default async function ControlRolesPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  if (!(await hasSystemAccessForUser(user))) {
    return <AccessDenied message="Раздел «Роли» доступен только администраторам." />;
  }
  return <RolesAdmin />;
}
