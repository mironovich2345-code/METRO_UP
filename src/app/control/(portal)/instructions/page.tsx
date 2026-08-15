import { getCurrentUser } from "@/lib/server/session";
import { canAccessAdmin } from "@/lib/roles";
import { AccessDenied } from "@/components/control/AccessDenied";
import { InstructionsAdmin } from "@/components/control/InstructionsAdmin";

export const dynamic = "force-dynamic";

/** Work Instructions CMS — ADMIN only. */
export default async function ControlInstructionsPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  if (!canAccessAdmin(user.role)) {
    return <AccessDenied message="Раздел «Инструкции» доступен только администраторам." />;
  }
  return <InstructionsAdmin />;
}
