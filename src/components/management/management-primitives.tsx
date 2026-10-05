"use client";

import Link from "next/link";
import { ChevronRight, CheckCircle2, type LucideIcon } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { Avatar } from "@/components/ui/avatar";
import { GlassCard } from "@/components/ui/glass-card";
import { cn } from "@/lib/utils";
import { useApp } from "@/providers/app-provider";
import { useAppUser } from "@/providers/AppUserProvider";

/**
 * METRO UP, Management UX Round A — the small shared management visual
 * primitive set the audit recommended. Round A.1/B now adopt `ManagementAvatarLink`
 * (root-screen Profile entry) and the rest of this set (CLUB_MANAGER Home).
 *
 * Deliberately NOT built: a generic `ManagementHomeSection` wrapper —
 * CLUB_MANAGER and CITY_MANAGER Home layouts differ enough in content and
 * order that one more wrapper abstraction on top of these pieces would
 * only be a prop-soup, per the audit's own explicit recommendation against
 * abstraction for its own sake.
 *
 * SECTION 10, the design rule every primitive below encodes: brand/yellow
 * emphasis means "this needs attention or is the primary action" — never
 * decoration. AttentionItem is the ONLY primitive here that uses
 * `bg-brand/12`/`text-brand` on its icon; ManagementListRow (plain
 * navigation, nothing to act on) uses a neutral `bg-muted`/
 * `text-muted-foreground` icon treatment instead — the exact split the
 * audit's visual-system section asked for. This round does not touch any
 * PERSONAL screen's styling (none of PERSONAL's existing components import
 * from this file).
 */

/* ============================== ManagementAvatarLink ============================== */

/**
 * Round A.1, section A — the ONE Profile entry pattern (avatar → /profile),
 * now reusable on management ROOT screens beyond Home. Self-contained
 * (reads profile/avatar itself via the same two hooks Home already reads
 * them from) so a call site only ever does
 * `<AppHeader leading={<ManagementAvatarLink />} .../>` — no prop
 * threading needed. Renders nothing before `profile` has hydrated (same
 * "nothing to show yet" guard every other profile-dependent read in this
 * app already uses) rather than a placeholder avatar. Deliberately no
 * chevron/"Профиль" text — the avatar alone is already an established,
 * recognized tap target (Home's own header has used it, unchanged, since
 * Milestone 1); this is a smaller, secondary-header-sized instance of the
 * exact same pattern, never a second, different one.
 */
export function ManagementAvatarLink() {
  const { profile } = useApp();
  const { user } = useAppUser();
  if (!profile) return null;
  return (
    <Link
      href="/profile"
      aria-label="Открыть профиль"
      className="-m-1 flex shrink-0 items-center rounded-2xl p-1 transition-colors active:bg-foreground/5"
    >
      <Avatar name={profile.displayName} src={user?.avatarUrl ?? undefined} size={36} ring />
    </Link>
  );
}

/* ============================== ManagementHeader ============================== */

/**
 * Section 9 — standardized "Role · Scope" header line, e.g. "Управляющий ·
 * Полтавская" / "Ст. города · Нижний Новгород". A single compact title
 * line (not AppHeader's usual two-line title+subtitle stack) — deliberately
 * matching the task's own one-line examples rather than introducing a
 * taller header. Pass `leading={<ManagementAvatarLink />}` explicitly when
 * a call site wants the Profile entry too — this component has no avatar
 * built in by default, so a secondary screen that still wants its own
 * distinct title (rather than this generic Role·Scope line) is never
 * forced to also take an opinion on Profile entry it doesn't need.
 */
export function ManagementHeader({
  roleLabel,
  scopeLabel,
  showBack,
  backHref,
  leading,
}: {
  roleLabel: string;
  scopeLabel?: string | null;
  showBack?: boolean;
  backHref?: string;
  leading?: React.ReactNode;
}) {
  const title = scopeLabel ? `${roleLabel} · ${scopeLabel}` : roleLabel;
  return <AppHeader title={title} showBack={showBack} backHref={backHref} leading={leading} showThemeSwitcher={false} />;
}

/* ============================== ManagementEmptyState ============================== */

/**
 * Section 13 — consolidates the "Сейчас ничего не требует внимания" card
 * copy-pasted today across home/page.tsx's local `EmptyAttention`, /city,
 * /city/club, and /team's inline equivalents.
 *
 * Round B.1, section 3 — live review found the ORIGINAL version (pad="md",
 * a size-9 rounded-2xl icon BADGE) too tall for what is, in context, a
 * "nothing to do" line directly under its own section header — not a
 * card that needs its own visual weight. Tightened to pad="sm" and a bare
 * checkmark glyph (no badge bubble) — one calm, compact row, matching
 * "✓ Сейчас ничего не требует внимания" — while keeping the section
 * header above it (the stable Требует внимания hierarchy stays, only the
 * empty-state row itself shrank).
 */
export function ManagementEmptyState({ text = "Сейчас ничего не требует внимания." }: { text?: string }) {
  return (
    <GlassCard variant="solid" pad="sm" animateIn={false} className="flex items-center gap-2">
      <CheckCircle2 className="size-4 shrink-0 text-success" />
      <p className="text-sm text-muted-foreground">{text}</p>
    </GlassCard>
  );
}

/* ============================== Attention ============================== */

export interface AttentionItemData {
  key: string;
  icon: LucideIcon;
  text: string;
  onClick: () => void;
}

/** Section 10 — the ONE place brand/yellow emphasis belongs: a row that
 * genuinely requires action. */
export function AttentionItem({ icon: Icon, text, onClick }: Omit<AttentionItemData, "key">) {
  return (
    <GlassCard variant="solid" pad="md" animateIn={false} interactive onClick={onClick} className="flex items-center gap-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-2xl bg-brand/12">
        <Icon className="size-5 text-brand" />
      </span>
      <p className="min-w-0 flex-1 truncate text-sm font-semibold">{text}</p>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
    </GlassCard>
  );
}

/** Consolidates the three independent "Требует внимания" implementations
 * the audit found (Home's CityManagerHomeSection, Home's
 * ClubManagerHomeSection, /city's local AttentionList) into one. Renders
 * ManagementEmptyState automatically when there is nothing to show — a
 * caller never needs its own empty-state branch. */
export function AttentionSection({ title = "Требует внимания", items }: { title?: string; items: AttentionItemData[] }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="px-1 text-sm font-bold text-foreground">{title}</p>
      {items.length === 0 ? (
        <ManagementEmptyState />
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((item) => (
            <AttentionItem key={item.key} icon={item.icon} text={item.text} onClick={item.onClick} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ============================== ManagementListRow ============================== */

export interface ManagementListRowData {
  key: string;
  icon: LucideIcon;
  title: string;
  subtitle?: string | null;
  /** An optional trailing value/badge — e.g. a plain count, or a
   * `bg-brand/12`-styled badge when THIS specific row (not the whole list)
   * needs a meaningful highlight. The row itself stays neutral regardless;
   * any yellow here is the caller's deliberate choice, not this
   * component's default. */
  trailing?: React.ReactNode;
  onClick: () => void;
}

/**
 * Section 11 — the one canonical compact management row: icon marker ·
 * title · optional subtitle · optional trailing value/badge · chevron.
 * Neutral `bg-muted` icon background (section 10's "normal navigation rows
 * = neutral" rule) — never brand/yellow by default, unlike AttentionItem
 * above. Intended usage is one `GlassCard variant="solid" pad="none"` with
 * `divide-y divide-border` wrapping several of these rows (the same
 * pattern /city's club list, /city/training, and /team's roster already
 * use correctly) — this component is only the row; the audit's own
 * instruction was to prove the row primitive, not also invent a
 * `ManagementListSection` wrapper nothing asked for.
 */
export function ManagementListRow({ icon: Icon, title, subtitle, trailing, onClick }: Omit<ManagementListRowData, "key">) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-3 p-4 text-left transition-colors active:bg-foreground/5">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-muted">
        <Icon className="size-4.5 text-muted-foreground" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{title}</p>
        {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {trailing}
      <ChevronRight className="size-4 shrink-0 text-muted-foreground/50" />
    </button>
  );
}

/* ============================== ManagementSummary / ManagementStat ============================== */

export interface ManagementStatData {
  key: string;
  label: string;
  value: string | number;
}

/** One label+value pair — no card chrome of its own, meant to sit inside
 * ManagementSummary's single shared card (or standalone, if a future
 * screen genuinely needs just one). */
export function ManagementStat({ label, value }: Omit<ManagementStatData, "key">) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-0.5">
      <p className="text-lg font-bold tabular-nums">{value}</p>
      <p className="truncate text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

/**
 * Section 12 — "visually light, not giant KPI cards." The audit found
 * every existing stat row (/team, /city, /city/club) built as N separate
 * `grid-cols-N` cards, each with its own border/shadow/padding — this is
 * the heavier pattern section 12 asks to move away from. ManagementSummary
 * is deliberately ONE card with internal dividers between stats, not N
 * cards — lighter by construction, not just by smaller numbers.
 */
export function ManagementSummary({ stats }: { stats: ManagementStatData[] }) {
  return (
    <GlassCard variant="solid" pad="md" animateIn={false} className="flex items-center gap-2">
      {stats.map((s, i) => (
        <div key={s.key} className={cn("flex min-w-0 flex-1", i > 0 && "border-l border-border pl-2")}>
          <ManagementStat label={s.label} value={s.value} />
        </div>
      ))}
    </GlassCard>
  );
}
