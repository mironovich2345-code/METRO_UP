"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { Loader2, RotateCw, WifiOff } from "lucide-react";
import { useApp } from "@/providers/app-provider";
import { useAppUser } from "@/providers/AppUserProvider";
import { useTelegram } from "@/providers/TelegramProvider";
import { bootPhase } from "@/lib/boot-state";
import { sendBootstrapDiag } from "@/lib/bootstrap-diag";

/**
 * Single recovery gate for the employee Mini App (P0 black-screen fix). Before an
 * employee route renders, resolve the bootstrap phase ONCE, centrally:
 *   - loading → a real loader (never a blank full-height div);
 *   - error   → a recoverable screen with a working Retry (reuses the existing
 *               bootstrapError / retryBootstrap — no second auth implementation);
 *   - ready   → render the route; the page keeps its own onboarding/redirect logic.
 * Mounted only for employee routes (see AppShellFrame); /control|/admin|/spm are
 * not gated here. This does not redirect, so it cannot create routing loops.
 */
export function EmployeeBootGate({ children }: { children: React.ReactNode }) {
  const { hydrated, bootstrapError, retryBootstrap, profile } = useApp();
  const { isInsideTelegram } = useTelegram();
  const { attemptId } = useAppUser();
  const pathname = usePathname();
  const phase = bootPhase({ bootstrapError, hydrated });

  // Safe diagnostics — no initData/token/PII. One line per phase change only.
  const lastLogged = useRef<string>("");
  useEffect(() => {
    const key = `${phase}:${pathname}`;
    if (lastLogged.current === key) return;
    lastLogged.current = key;
    console.info(
      `[app-bootstrap] ${JSON.stringify({ phase, hasServerProfile: Boolean(profile), isInsideTelegram, pathname })}`,
    );
  }, [phase, pathname, profile, isInsideTelegram]);

  // Beacon gate_ready once per attempt (proves the gate actually rendered content).
  const gateReadyFor = useRef<string>("");
  useEffect(() => {
    if (phase === "ready" && gateReadyFor.current !== attemptId) {
      gateReadyFor.current = attemptId;
      sendBootstrapDiag({ phase: "gate_ready", attemptId });
    }
  }, [phase, attemptId]);

  if (phase === "error") {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-5 px-8 text-center">
        <span className="flex size-14 items-center justify-center rounded-3xl bg-muted">
          <WifiOff className="size-6 text-muted-foreground" />
        </span>
        <div>
          <p className="text-lg font-bold">Не удалось загрузить приложение</p>
          <p className="mt-1.5 text-sm text-muted-foreground">Проверьте соединение и попробуйте ещё раз.</p>
        </div>
        <button
          type="button"
          onClick={retryBootstrap}
          className="inline-flex items-center gap-2 rounded-2xl bg-brand px-5 py-3 text-sm font-semibold text-brand-foreground"
        >
          <RotateCw className="size-4" /> Повторить
        </button>
      </div>
    );
  }

  if (phase === "loading") {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 text-center">
        <p className="text-xl font-extrabold tracking-tight">METRO UP</p>
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Загрузка…</p>
      </div>
    );
  }

  return <>{children}</>;
}
