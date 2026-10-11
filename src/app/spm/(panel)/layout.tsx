import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/server/session";
import { hasSharedControlAccessForUser, hasSystemAccessForUser } from "@/lib/server/authz";
import { ControlShell } from "@/components/control/ControlShell";
import { AccessDenied } from "@/components/control/AccessDenied";

export const metadata: Metadata = { title: "METRO UP Control — Продажи и рейтинг" };
export const dynamic = "force-dynamic";

/**
 * SPM sections (sales / mystery / rating) — Sprint: LIVE QA QA-06.1: the
 * shared PROJECT_ADMIN + SPM workspace (hasSharedControlAccessForUser: an
 * active PROJECT_ADMIN/SYSTEM grant — no legacy AppRole needed — legacy
 * ADMIN, or legacy SPM). Enforced here AND in every /api/spm route via
 * requireSharedControlAccess(). `hasSystemAccess` only affects which nav
 * items are offered, not this gate.
 */
export default async function SpmPanelLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user || !(await hasSharedControlAccessForUser(user))) {
    return <AccessDenied message={user ? "У вас нет доступа к панели управления." : "Войдите, чтобы открыть панель управления."} />;
  }
  const systemAccess = await hasSystemAccessForUser(user);
  return (
    <ControlShell displayName={user.displayName} role={user.role} hasSystemAccess={systemAccess}>
      {children}
    </ControlShell>
  );
}
