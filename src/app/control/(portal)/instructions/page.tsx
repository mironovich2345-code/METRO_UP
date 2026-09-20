import { getCurrentUser } from "@/lib/server/session";
import { hasSystemAccessForUser } from "@/lib/server/authz";
import { AccessDenied } from "@/components/control/AccessDenied";
import { InstructionsAdmin } from "@/components/control/InstructionsAdmin";

export const dynamic = "force-dynamic";

/** Work Instructions CMS — SYSTEM access only. */
export default async function ControlInstructionsPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  if (!(await hasSystemAccessForUser(user))) {
    return <AccessDenied message="Раздел «Инструкции» доступен только администраторам." />;
  }
  return <InstructionsAdmin />;
}
