import { getCurrentUser } from "@/lib/server/session";
import { hasSystemAccessForUser } from "@/lib/server/authz";
import { AccessDenied } from "@/components/control/AccessDenied";
import { MetricStatusAdmin } from "@/components/control/MetricStatusAdmin";

export const dynamic = "force-dynamic";

/** Metric knowledge sync status — SYSTEM access only. */
export default async function ControlMetricPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  if (!(await hasSystemAccessForUser(user))) {
    return <AccessDenied message="Раздел «Метрик» доступен только администраторам." />;
  }
  return <MetricStatusAdmin />;
}
