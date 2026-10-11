"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Eye, X } from "lucide-react";

const ROLE_LABEL: Record<string, string> = {
  MANAGER: "Менеджер",
  CLUB_MANAGER: "Управляющий",
  CITY_MANAGER: "Ст. города",
};

/**
 * Sprint 1 / Phase 2B section 15 — "нельзя визуально скрыть факт preview".
 * Rendered by ControlShell whenever the server resolved an active View As
 * context for this request (see control/(portal)/layout.tsx) — never
 * computed from client state alone, so it can't drift from what the server
 * is actually honoring. Sprint 1 / Phase 2D also renders it from the
 * Mini-App shell (app-shell-frame.tsx), driven by /api/auth/me's
 * `viewContext` field instead — same component, same "can't hide the fact
 * of preview" guarantee, different data source.
 *
 * `onEnded` — the control portal (Server Components) needs `router.refresh()`
 * to re-run the layout/page and pick up the now-absent viewContext; the
 * Mini App is entirely client-rendered (AppUserProvider's fetch-based state),
 * where a router refresh has nothing server-rendered to re-run. Defaults to
 * the pre-existing raw fetch + router.refresh() so the desktop /control
 * portal (ControlShell, no onEnded passed) is completely unaffected by this
 * component's own QA-01 changes below.
 *
 * Sprint: LIVE QA FIX QA-01 — `onEnded`'s contract changed: it now owns the
 * ENTIRE end-preview operation (the server call included), not just a
 * post-hoc cleanup step. Root cause this closes: this component used to
 * call `fetch(".../view-as/end")` directly — bypassing viewAsApi.end()'s
 * own clearAllQueries() — and then fired `onEnded()` WITHOUT awaiting it,
 * so `end()` returned (re-enabling this button) before the Mini App's
 * AppUser had even started refreshing; nothing told the still-mounted
 * preview screen underneath to stop rendering for that whole window. The
 * Mini App (app-shell-frame.tsx) now passes an `onEnded` that wraps the
 * server call + confirmIdentity() inside its own global switchContext gate
 * and is awaited here to full completion — success or failure — before
 * this button re-enables, and a failure now surfaces inline instead of
 * being silently swallowed by the old bare `finally`.
 */
export function ViewAsBanner({
  previewRole,
  realRoleLabel,
  scopeLabel,
  onEnded,
}: {
  previewRole: string;
  realRoleLabel: string;
  /** Sprint: manual-test-round-2, section 3 — the club being previewed
   * (CLUB_MANAGER/MANAGER previews are always club-scoped); omitted for a
   * CITY_MANAGER self-preview, which has no single club to name. */
  scopeLabel?: string | null;
  onEnded?: () => Promise<void>;
}) {
  const router = useRouter();
  const [ending, setEnding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const end = async () => {
    setEnding(true);
    setError(null);
    try {
      if (onEnded) {
        await onEnded();
      } else {
        await fetch("/api/control/view-as/end", { method: "POST", credentials: "same-origin" });
        router.refresh();
      }
    } catch {
      // Section 9 — do not leave the app stuck, do not pretend success:
      // surface a retryable error instead of silently declaring the
      // preview ended (the old bare `finally` above used to do exactly
      // that regardless of whether the request actually succeeded).
      setError("Не удалось выйти из режима просмотра. Попробуйте ещё раз.");
    } finally {
      setEnding(false);
    }
  };

  return (
    <div className="sticky top-0 z-50 flex flex-wrap items-center justify-between gap-2 bg-brand px-4 py-2.5 text-sm font-semibold text-brand-foreground">
      <span className="inline-flex items-center gap-2">
        <Eye className="size-4" />
        Режим просмотра: {ROLE_LABEL[previewRole] ?? previewRole}
        {scopeLabel && <span className="font-normal opacity-80">· {scopeLabel}</span>}
        <span className="font-normal opacity-80">· Ваша роль: {realRoleLabel}</span>
      </span>
      <button
        onClick={() => void end()}
        disabled={ending}
        className="inline-flex items-center gap-1 rounded-xl bg-black/15 px-3 py-1 text-xs font-semibold disabled:opacity-60"
      >
        <X className="size-3.5" />
        {ending ? "…" : "Выйти из режима просмотра"}
      </button>
      {error && <p className="w-full basis-full text-xs font-normal text-red-100">{error}</p>}
    </div>
  );
}
