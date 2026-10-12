import { getCurrentUser } from "@/lib/server/session";
import { hasSystemAccessForUser } from "@/lib/server/authz";
import { AccessDenied } from "@/components/control/AccessDenied";
import { VisitsAdmin } from "@/components/control/VisitsAdmin";

export const dynamic = "force-dynamic";

/** «Посещаемость» — PROJECT_ADMIN only (Sprint: LIVE QA QA-07). The API
 * enforces the same requireSystemAccess guard. */
export default async function ControlVisitsPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  if (!(await hasSystemAccessForUser(user))) {
    return <AccessDenied message="Раздел «Посещаемость» доступен только администраторам." />;
  }
  return <VisitsAdmin />;
}
