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
 * is actually honoring.
 */
export function ViewAsBanner({ previewRole, realRoleLabel }: { previewRole: string; realRoleLabel: string }) {
  const router = useRouter();
  const [ending, setEnding] = useState(false);

  const end = async () => {
    setEnding(true);
    try {
      await fetch("/api/control/view-as/end", { method: "POST", credentials: "same-origin" });
    } finally {
      router.refresh();
    }
  };

  return (
    <div className="sticky top-0 z-50 flex flex-wrap items-center justify-between gap-2 bg-brand px-4 py-2.5 text-sm font-semibold text-brand-foreground">
      <span className="inline-flex items-center gap-2">
        <Eye className="size-4" />
        Режим просмотра: {ROLE_LABEL[previewRole] ?? previewRole}
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
    </div>
  );
}
