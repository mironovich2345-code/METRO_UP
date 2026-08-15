import { getCurrentUser } from "@/lib/server/session";
import { canAccessAdmin } from "@/lib/roles";
import { AccessDenied } from "@/components/control/AccessDenied";
import { MetricDocumentsAdmin } from "@/components/control/MetricDocumentsAdmin";

export const dynamic = "force-dynamic";

/** Metric documents CMS — ADMIN only. */
export default async function ControlMetricDocumentsPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  if (!canAccessAdmin(user.role)) {
    return <AccessDenied message="Раздел «Документы Метрика» доступен только администраторам." />;
  }
  return <MetricDocumentsAdmin />;
}
