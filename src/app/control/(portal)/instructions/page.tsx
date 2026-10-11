import { getCurrentUser } from "@/lib/server/session";
import { hasSharedControlAccessForUser } from "@/lib/server/authz";
import { AccessDenied } from "@/components/control/AccessDenied";
import { InstructionsAdmin } from "@/components/control/InstructionsAdmin";

export const dynamic = "force-dynamic";

/** Work Instructions CMS — shared PROJECT_ADMIN + SPM workspace (QA-06.1, hasSharedControlAccessForUser). */
export default async function ControlInstructionsPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  if (!(await hasSharedControlAccessForUser(user))) {
    return <AccessDenied message="Раздел «Инструкции» доступен администраторам и СПМ." />;
  }
  return <InstructionsAdmin />;
}
