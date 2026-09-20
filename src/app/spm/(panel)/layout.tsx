import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/server/session";
import { canAccessSpm } from "@/lib/roles";
import { hasSystemAccessForUser } from "@/lib/server/authz";
import { ControlShell } from "@/components/control/ControlShell";
import { AccessDenied } from "@/components/control/AccessDenied";

export const metadata: Metadata = { title: "METRO UP Control — Продажи и рейтинг" };
export const dynamic = "force-dynamic";

/**
 * SPM sections (sales / mystery / rating) — SPM or ADMIN (canAccessSpm, legacy
 * — SPM is explicitly untouched by the RBAC foundation, see Sprint 1 plan).
 * Enforced here AND in every /api/spm route via requireSPMAccess(). Rendered
 * in the unified control shell; `hasSystemAccess` only affects CMS nav-item
 * visibility, not this gate.
 */
export default async function SpmPanelLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user || !canAccessSpm(user.role)) {
    return <AccessDenied message={user ? "У вас нет доступа к панели управления." : "Войдите, чтобы открыть панель управления."} />;
  }
  const systemAccess = await hasSystemAccessForUser(user);
  return (
    <ControlShell displayName={user.displayName} role={user.role} hasSystemAccess={systemAccess}>
      {children}
    </ControlShell>
  );
}
