"use client";

import { Clock, LogOut } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { useAppUser } from "@/providers/AppUserProvider";

/**
 * accessStatus = PENDING_APPROVAL (Sprint 1 / Phase 2B, section 10). Shown
 * for a just-onboarded employee before their CLUB_MANAGER approves them —
 * server-side enforcement (requireLimitedOrFullAccess/requireFullAccess,
 * authz.ts) is what actually blocks every operational route regardless of
 * this screen; this exists only so the wait is legible instead of a Home
 * full of failed requests.
 */
export function PendingApprovalScreen() {
  const { signOut } = useAppUser();

  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center bg-background px-6 text-center text-foreground">
      <Logo size="md" />
      <span className="mt-8 flex size-14 items-center justify-center rounded-2xl bg-brand/12">
        <Clock className="size-6 text-brand" />
      </span>
      <h1 className="mt-5 text-lg font-bold">Заявка отправлена</h1>
      <p className="mt-2 max-w-[280px] text-sm text-muted-foreground">
        Ожидайте подтверждения управляющего вашего клуба. Это обычно занимает немного времени.
      </p>
      <Button variant="ghost" size="sm" className="mt-8" onClick={() => void signOut()}>
        <LogOut className="size-4" />
        Выйти
      </Button>
    </main>
  );
}
