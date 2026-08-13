import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/server/session";
import { canAccessAdmin } from "@/lib/roles";
import { ControlShell } from "@/components/control/ControlShell";
import { AccessDenied } from "@/components/control/AccessDenied";

export const metadata: Metadata = { title: "METRO UP Control — Обучение" };
export const dynamic = "force-dynamic";

/**
 * CMS (Обучение/Медиа) — ADMIN only. Enforced here AND in every /api/admin route
 * via requireAdmin(). Rendered inside the unified control shell so ADMIN moves
 * seamlessly between learning and SPM sections.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user || !canAccessAdmin(user.role)) {
    return (
      <AccessDenied
        message={user ? "Раздел «Обучение» доступен только администраторам." : "Войдите, чтобы открыть панель управления."}
      />
    );
  }
  return (
    <ControlShell displayName={user.displayName} role={user.role}>
      {children}
    </ControlShell>
  );
}
