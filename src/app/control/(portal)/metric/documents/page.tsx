import { getCurrentUser } from "@/lib/server/session";
import { hasSystemAccessForUser } from "@/lib/server/authz";
import { AccessDenied } from "@/components/control/AccessDenied";
import { MetricDocumentsAdmin } from "@/components/control/MetricDocumentsAdmin";

export const dynamic = "force-dynamic";

/** Metric documents CMS — SYSTEM access only. */
export default async function ControlMetricDocumentsPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  if (!(await hasSystemAccessForUser(user))) {
    return <AccessDenied message="Раздел «Документы Метрика» доступен только администраторам." />;
  }
  return <MetricDocumentsAdmin />;
}
