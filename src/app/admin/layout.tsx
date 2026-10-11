import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/server/session";
import { hasSharedControlAccessForUser, hasSystemAccessForUser } from "@/lib/server/authz";
import { ControlShell } from "@/components/control/ControlShell";
import { AccessDenied } from "@/components/control/AccessDenied";

export const metadata: Metadata = { title: "METRO UP Control — Обучение" };
export const dynamic = "force-dynamic";

/**
 * CMS (Обучение/Медиа) — Sprint: LIVE QA QA-06.1: shared PROJECT_ADMIN + SPM
 * content workspace (hasSharedControlAccessForUser: an active
 * PROJECT_ADMIN/SYSTEM grant, legacy AppRole=ADMIN, or legacy AppRole=SPM).
 * Enforced here AND in every /api/admin route via requireSharedControlAccess().
 * Rendered inside the unified control shell; `hasSystemAccess` there only
 * decides which nav items are offered.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  const sharedAccess = user ? await hasSharedControlAccessForUser(user) : false;
  if (!user || !sharedAccess) {
    return (
      <AccessDenied
        message={user ? "Раздел «Обучение» доступен администраторам и СПМ." : "Войдите, чтобы открыть панель управления."}
      />
    );
  }
  const systemAccess = await hasSystemAccessForUser(user);
  return (
    <ControlShell displayName={user.displayName} role={user.role} hasSystemAccess={systemAccess}>
      {children}
    </ControlShell>
  );
}
