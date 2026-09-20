import { getCurrentUser } from "@/lib/server/session";
import { hasSystemAccessForUser } from "@/lib/server/authz";
import { AccessDenied } from "@/components/control/AccessDenied";
import { ScriptsAdmin } from "@/components/control/ScriptsAdmin";

export const dynamic = "force-dynamic";

/** Scripts CMS — SYSTEM access only (the portal layout allows SPM/CLUB_MANAGER in). */
export default async function ControlScriptsPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  if (!(await hasSystemAccessForUser(user))) {
    return <AccessDenied message="Раздел «Скрипты» доступен только администраторам." />;
  }
  return <ScriptsAdmin />;
}
