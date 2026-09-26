"use client";

import { RotateCw, CheckCircle2 } from "lucide-react";
import type { AccessStatusDTO } from "@/lib/api/types";
import { cn } from "@/lib/utils";

/**
 * Sprint: role-cabinets, step 6, section 19 — small, genuinely-shared
 * presentational pieces pulled out of CityManagerCabinet.tsx/
 * CityManagerClubDetail.tsx (step 5) once ClubManagerCabinet needed the same
 * loading/error/stat/badge/empty-state markup a third time. Deliberately
 * NOT a configurable "dashboard engine" — these are plain components with a
 * handful of props each, same spirit as GlassCard/Badge/Button in the
 * Mini-App design system, just for the /control desktop portal's own
 * (--brand/--brand-foreground, rounded-3xl/border-border) visual language.
 */

export function CabinetSkeleton({ blocks = 4 }: { blocks?: number }) {
  return (
    <div className="space-y-4">
      <div className="h-7 w-40 animate-pulse rounded-xl bg-muted" />
      {Array.from({ length: blocks }).map((_, i) => (
        <div key={i} className="h-24 animate-pulse rounded-3xl bg-muted" />
      ))}
    </div>
  );
}

export function CabinetErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-3xl border border-border bg-card p-6 text-center">
      <p className="text-sm text-red-500">{message}</p>
      <button onClick={onRetry} className="mt-3 inline-flex items-center gap-1.5 rounded-2xl border border-border px-4 py-2 text-sm font-semibold">
        <RotateCw className="size-4" /> Повторить
      </button>
    </div>
  );
}

/** The positive "nothing to see here" state — restrained, not celebratory
 * (a plain check, no confetti/gamification), used by every attention section. */
export function CabinetEmptyGood({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-3xl border border-border bg-card p-5 text-sm text-muted-foreground">
      <CheckCircle2 className="size-4 text-success" /> {message}
    </div>
  );
}

/** The 4-across (or 2x2 on mobile) summary card — icon, big number, label. */
export function StatCard({
  icon: Icon,
  label,
  value,
  emphasize,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  emphasize?: boolean;
}) {
  return (
    <div className="rounded-3xl border border-border bg-card p-4">
      <Icon className={cn("size-4", emphasize && value > 0 ? "text-brand" : "text-muted-foreground")} />
      <p className="mt-2 text-2xl font-bold tabular-nums">{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

/** The more compact stat used inside a Section block (detail pages). */
export function SmallStat({
  icon: Icon,
  label,
  value,
  highlight,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div>
      <Icon className={cn("size-4", highlight && value > 0 ? "text-brand" : "text-muted-foreground")} />
      <p className="mt-1.5 text-xl font-bold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

/** A titled card wrapper for detail-page sections (Общее/Управляющий/…). */
export function CabinetSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-6">
      <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">{title}</h2>
      <div className="mt-2.5 rounded-3xl border border-border bg-card p-4">{children}</div>
    </div>
  );
}

/**
 * Human-facing access labels — section 7's explicit requirement: never leak
 * raw enum values (PENDING_APPROVAL/LIMITED/FULL/SUSPENDED) into the UI.
 */
const ACCESS_LABEL: Record<AccessStatusDTO, string> = {
  LIMITED: "Ограниченный доступ",
  PENDING_APPROVAL: "Ожидает подтверждения",
  FULL: "Активен",
  SUSPENDED: "Приостановлен",
};

export function AccessBadge({ status, onboarded }: { status: AccessStatusDTO; onboarded: boolean }) {
  if (!onboarded) return <span className="text-xs text-muted-foreground">Онбординг не завершён</span>;
  const cls =
    status === "SUSPENDED"
      ? "bg-red-500/10 text-red-500"
      : status === "PENDING_APPROVAL"
        ? "bg-brand/15 text-brand-strong"
        : status === "FULL"
          ? "bg-success-soft text-success"
          : "bg-muted text-muted-foreground";
  return <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-semibold", cls)}>{ACCESS_LABEL[status]}</span>;
}
