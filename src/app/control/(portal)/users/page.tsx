import { getCurrentUser } from "@/lib/server/session";
import { canAccessAdmin } from "@/lib/roles";
import { AccessDenied } from "@/components/control/AccessDenied";
import { UsersAdmin } from "@/components/control/UsersAdmin";

export const dynamic = "force-dynamic";

/** Employee / role management — ADMIN only (SPM and CLUB_MANAGER are denied). */
export default async function ControlUsersPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  if (!canAccessAdmin(user.role)) {
    return <AccessDenied message="Раздел «Сотрудники» доступен только администраторам." />;
  }
  return <UsersAdmin currentUserId={user.id} />;
}
