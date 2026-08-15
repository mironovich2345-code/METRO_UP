import { getCurrentUser } from "@/lib/server/session";
import { canAccessAdmin } from "@/lib/roles";
import { AccessDenied } from "@/components/control/AccessDenied";
import { ScriptsAdmin } from "@/components/control/ScriptsAdmin";

export const dynamic = "force-dynamic";

/** Scripts CMS — ADMIN only (the portal layout allows SPM/CLUB_MANAGER in). */
export default async function ControlScriptsPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  if (!canAccessAdmin(user.role)) {
    return <AccessDenied message="Раздел «Скрипты» доступен только администраторам." />;
  }
  return <ScriptsAdmin />;
}
