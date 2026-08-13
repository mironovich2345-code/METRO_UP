import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/server/session";
import { canAccessSpm } from "@/lib/roles";
import { ControlShell } from "@/components/control/ControlShell";
import { AccessDenied } from "@/components/control/AccessDenied";

export const metadata: Metadata = { title: "METRO UP Control — Продажи и рейтинг" };
export const dynamic = "force-dynamic";

/**
 * SPM sections (sales / mystery / rating) — SPM or ADMIN (canAccessSpm). Enforced
 * here AND in every /api/spm route via requireSPMAccess(). Rendered in the unified
 * control shell.
 */
export default async function SpmPanelLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user || !canAccessSpm(user.role)) {
    return <AccessDenied message={user ? "У вас нет доступа к панели управления." : "Войдите, чтобы открыть панель управления."} />;
  }
  return (
    <ControlShell displayName={user.displayName} role={user.role}>
      {children}
    </ControlShell>
  );
}
