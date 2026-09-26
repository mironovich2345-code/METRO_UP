"use client";

import { Clock, LogOut } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { useAppUser } from "@/providers/AppUserProvider";

/**
 * accessStatus = PENDING_APPROVAL (Sprint 1 / Phase 2B, section 10).
 *
 * RETIRED by Sprint: mini-app-role-experience, section 2: this full-screen
 * dead-end ("Заявка отправлена" + nothing else to do) was exactly the
 * "mysterious blocking screen" that sprint's spec called out as unacceptable.
 * AccessStatusGate.tsx no longer renders this — PENDING_APPROVAL now gets a
 * real, narrowed Главная (OnboardingHomeDTO, home.ts) + Академия experience
 * instead. Left in place (not deleted) in case a future narrower use for it
 * reappears; it has no current callers.
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
