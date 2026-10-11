import { getCurrentUser } from "@/lib/server/session";
import { hasSystemAccessForUser } from "@/lib/server/authz";
import { AccessDenied } from "@/components/control/AccessDenied";
import { LogsAdmin } from "@/components/control/LogsAdmin";

export const dynamic = "force-dynamic";

/** «Логи» — UserAuditLog for PROJECT_ADMIN only (Sprint: LIVE QA QA-06). The
 * API (/api/control/logs) enforces the same requireSystemAccess guard. */
export default async function ControlLogsPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  if (!(await hasSystemAccessForUser(user))) {
    return <AccessDenied message="Раздел «Логи» доступен только администраторам." />;
  }
  return <LogsAdmin />;
}
