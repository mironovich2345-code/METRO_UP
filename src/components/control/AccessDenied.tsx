import Link from "next/link";
import { ShieldAlert } from "lucide-react";

/** Shared control-portal access-denied screen (EMPLOYEE / CLUB_MANAGER / anon). */
export function AccessDenied({
  message = "У вас нет доступа к панели управления.",
}: {
  message?: string;
}) {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background p-6 text-foreground">
      <div className="max-w-md rounded-3xl border border-border bg-card p-8 text-center shadow-[var(--shadow-card)]">
        <span className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-muted">
          <ShieldAlert className="size-6 text-muted-foreground" />
        </span>
        <h1 className="text-lg font-bold">METRO UP Control</h1>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        <Link
          href="/control/login"
          className="mt-4 inline-flex rounded-2xl bg-brand px-5 py-2.5 text-sm font-semibold text-brand-foreground"
        >
          Войти
        </Link>
      </div>
    </div>
  );
}
