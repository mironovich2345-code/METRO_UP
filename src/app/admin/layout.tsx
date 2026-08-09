import type { Metadata } from "next";
import { ShieldAlert } from "lucide-react";
import { getCurrentUser } from "@/lib/server/session";
import { AdminSidebar } from "@/components/admin/AdminSidebar";

export const metadata: Metadata = { title: "Metro CMS" };
export const dynamic = "force-dynamic";

/**
 * Server-enforced admin gate. Authorization is checked here (never trusting the
 * client) AND again in every /api/admin route via requireAdmin(). Non-admins
 * never receive the CMS shell.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  if (!user || user.role !== "ADMIN") {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-background p-6 text-foreground">
        <div className="max-w-md rounded-3xl border border-border bg-card p-8 text-center shadow-[var(--shadow-card)]">
          <span className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-muted">
            <ShieldAlert className="size-6 text-muted-foreground" />
          </span>
          <h1 className="text-lg font-bold">Доступ только для администраторов</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Войдите под учётной записью с ролью ADMIN. Сессия открывается через
            Telegram-авторизацию Metro UP; роль назначается в базе данных.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh] bg-background text-foreground">
      <AdminSidebar displayName={user.displayName} />
      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-6xl px-6 py-8">{children}</div>
      </main>
    </div>
  );
}
