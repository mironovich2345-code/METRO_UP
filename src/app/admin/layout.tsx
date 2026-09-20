import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/server/session";
import { hasSystemAccessForUser } from "@/lib/server/authz";
import { ControlShell } from "@/components/control/ControlShell";
import { AccessDenied } from "@/components/control/AccessDenied";

export const metadata: Metadata = { title: "METRO UP Control — Обучение" };
export const dynamic = "force-dynamic";

/**
 * CMS (Обучение/Медиа) — SYSTEM access only: legacy AppRole=ADMIN OR an active
 * PROJECT_ADMIN/SYSTEM RoleAssignment (see hasSystemAccessForUser). Enforced
 * here AND in every /api/admin route via requireSystemAccess(). Rendered
 * inside the unified control shell so the acting admin moves seamlessly
 * between learning and SPM sections.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  const systemAccess = user ? await hasSystemAccessForUser(user) : false;
  if (!user || !systemAccess) {
    return (
      <AccessDenied
        message={user ? "Раздел «Обучение» доступен только администраторам." : "Войдите, чтобы открыть панель управления."}
      />
    );
  }
  return (
    <ControlShell displayName={user.displayName} role={user.role} hasSystemAccess={systemAccess}>
      {children}
    </ControlShell>
  );
}
