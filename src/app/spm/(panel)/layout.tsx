import type { Metadata } from "next";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { getCurrentUser } from "@/lib/server/session";
import { canAccessSpm } from "@/lib/roles";
import { SpmSidebar } from "@/components/spm/SpmSidebar";

export const metadata: Metadata = { title: "Metro SPM" };
export const dynamic = "force-dynamic";

/**
 * Server-enforced SPM gate. Only AppRole.SPM (or ADMIN for read/debug) reaches
 * the panel; every /api/spm write also calls requireSPM(). Non-SPM users get an
 * access-denied screen with a link to the web login.
 */
export default async function SpmPanelLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  const allowed = user && canAccessSpm(user.role);

  if (!allowed) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-background p-6 text-foreground">
        <div className="max-w-md rounded-3xl border border-border bg-card p-8 text-center shadow-[var(--shadow-card)]">
          <span className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-muted">
            <ShieldAlert className="size-6 text-muted-foreground" />
          </span>
          <h1 className="text-lg font-bold">Доступ только для SPM</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Войдите под учётной записью с ролью SPM. Роль назначается администратором в базе данных.
          </p>
          <Link
            href="/spm/login"
            className="mt-4 inline-flex rounded-2xl bg-brand px-5 py-2.5 text-sm font-semibold text-brand-foreground"
          >
            Войти
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh] bg-background text-foreground">
      <SpmSidebar displayName={user!.displayName} isAdmin={user!.role === "ADMIN"} />
      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-6xl px-6 py-8">{children}</div>
      </main>
    </div>
  );
}
