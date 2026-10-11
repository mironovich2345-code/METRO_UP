"use client";

import { useState } from "react";
import { CheckCircle2, Clock, PauseCircle, RotateCw } from "lucide-react";
import { managerApi } from "@/lib/api/club-plan-client";
import type { AccessStatusDTO } from "@/lib/api/types";
import { describeClubAccessError, nextClubAccessAction, type ClubAccessAction, type ClubAccessActionKind } from "@/lib/control/club-access";
import { cn } from "@/lib/utils";

const ICON: Record<ClubAccessActionKind, typeof CheckCircle2> = {
  approve: Clock,
  grant_full: CheckCircle2,
  suspend: PauseCircle,
  restore: RotateCw,
};

/**
 * Sprint: LIVE QA QA-05.1 — the ONE access mutation for a club employee,
 * shared by «Управляющий» and the /control/team compatibility page. Calls the
 * SAME existing endpoints /control/team always used — approve for a PENDING
 * target, setAccess for everything else — scoped to the server-RESOLVED club
 * (never a raw client selection). Returns the server-confirmed status.
 */
export async function runClubAccessAction(action: ClubAccessAction, userId: string, clubId: string | null): Promise<AccessStatusDTO> {
  const res =
    action.endpoint === "approve"
      ? await managerApi.approve(userId, "FULL", clubId)
      : await managerApi.setAccess(userId, action.target, clubId);
  return res.accessStatus;
}

/**
 * One contextual action per employee (never a row of 3–4 buttons). The
 * caller decides WHETHER to render it (e.g. hidden during a View-As preview);
 * the server decides whether it is allowed. On failure the row keeps its
 * current status and the error is reported to the caller.
 */
export function ClubAccessActionButton({
  userId,
  status,
  clubId,
  onApplied,
  onError,
  className,
}: {
  userId: string;
  status: AccessStatusDTO;
  clubId: string | null;
  onApplied: (userId: string, status: AccessStatusDTO) => void;
  onError: (message: string) => void;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const action = nextClubAccessAction(status);
  const Icon = ICON[action.kind];

  const run = async () => {
    setBusy(true);
    try {
      onApplied(userId, await runClubAccessAction(action, userId, clubId));
    } catch (e) {
      onError(describeClubAccessError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void run()}
      disabled={busy || !clubId}
      className={cn(
        "inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold disabled:opacity-50",
        action.destructive ? "border border-border text-foreground hover:bg-muted" : "bg-brand text-brand-foreground",
        className,
      )}
    >
      {busy ? "…" : (
        <>
          <Icon className="size-3.5" aria-hidden />
          {action.label}
        </>
      )}
    </button>
  );
}
