import { getCurrentUser } from "@/lib/server/session";
import { hasSystemAccessForUser } from "@/lib/server/authz";
import { AccessDenied } from "@/components/control/AccessDenied";
import { MetricUsageAdmin } from "@/components/control/MetricUsageAdmin";

export const dynamic = "force-dynamic";

/** «Расходы Метрика» — PROJECT_ADMIN only (Sprint: LIVE QA QA-07). The APIs
 * enforce the same requireSystemAccess guard. */
export default async function ControlMetricUsagePage() {
  const user = await getCurrentUser();
  if (!user) return null;
  if (!(await hasSystemAccessForUser(user))) {
    return <AccessDenied message="Раздел «Расходы Метрика» доступен только администраторам." />;
  }
  return <MetricUsageAdmin />;
}
