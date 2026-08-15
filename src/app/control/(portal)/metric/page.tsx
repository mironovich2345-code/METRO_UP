import { getCurrentUser } from "@/lib/server/session";
import { canAccessAdmin } from "@/lib/roles";
import { AccessDenied } from "@/components/control/AccessDenied";
import { MetricStatusAdmin } from "@/components/control/MetricStatusAdmin";

export const dynamic = "force-dynamic";

/** Metric knowledge sync status — ADMIN only. */
export default async function ControlMetricPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  if (!canAccessAdmin(user.role)) {
    return <AccessDenied message="Раздел «Метрик» доступен только администраторам." />;
  }
  return <MetricStatusAdmin />;
}
