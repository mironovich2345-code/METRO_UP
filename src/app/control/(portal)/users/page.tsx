import { getCurrentUser } from "@/lib/server/session";
import { hasSystemAccessForUser } from "@/lib/server/authz";
import { AccessDenied } from "@/components/control/AccessDenied";
import { UsersAdmin } from "@/components/control/UsersAdmin";

export const dynamic = "force-dynamic";

/** Employee / role management — SYSTEM access only (SPM and CLUB_MANAGER are denied). */
export default async function ControlUsersPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  if (!(await hasSystemAccessForUser(user))) {
    return <AccessDenied message="Раздел «Сотрудники» доступен только администраторам." />;
  }
  return <UsersAdmin currentUserId={user.id} />;
}
