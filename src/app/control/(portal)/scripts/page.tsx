import { getCurrentUser } from "@/lib/server/session";
import { hasSharedControlAccessForUser } from "@/lib/server/authz";
import { AccessDenied } from "@/components/control/AccessDenied";
import { ScriptsAdmin } from "@/components/control/ScriptsAdmin";

export const dynamic = "force-dynamic";

/** Scripts CMS — shared PROJECT_ADMIN + SPM workspace (QA-06.1, hasSharedControlAccessForUser). */
export default async function ControlScriptsPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  if (!(await hasSharedControlAccessForUser(user))) {
    return <AccessDenied message="Раздел «Скрипты» доступен администраторам и СПМ." />;
  }
  return <ScriptsAdmin />;
}
