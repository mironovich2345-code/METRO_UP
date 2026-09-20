"use client";

import { RefreshCw, LogOut } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { useAppUser } from "@/providers/AppUserProvider";

/**
 * accessStatus = SUSPENDED (Sprint 1 / Phase 2B, section 5/11 — approved
 * public contract). Deliberately neutral wording — never "доступ закрыт",
 * "вас заблокировал руководитель", "вы уволены", or any hint of WHO
 * suspended access or WHY. The server already returns a neutral 403
 * APP_TEMPORARILY_UNAVAILABLE for every protected route (never HTTP 503,
 * which would read as an infrastructure outage) — the real reason lives only
 * in UserAuditLog (ACCESS_SUSPENDED), never here or in any client-visible
 * string.
 */
export function SuspendedScreen() {
  const { signOut } = useAppUser();

  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center bg-background px-6 text-center text-foreground">
      <Logo size="md" />
      <span className="mt-8 flex size-14 items-center justify-center rounded-2xl bg-muted">
        <RefreshCw className="size-6 text-muted-foreground" />
      </span>
      <h1 className="mt-5 text-lg font-bold">Технические неполадки</h1>
      <p className="mt-2 max-w-[280px] text-sm text-muted-foreground">
        Возникли технические неполадки. Попробуйте открыть приложение позднее.
      </p>
      <Button variant="ghost" size="sm" className="mt-8" onClick={() => void signOut()}>
        <LogOut className="size-4" />
        Выйти
      </Button>
    </main>
  );
}
