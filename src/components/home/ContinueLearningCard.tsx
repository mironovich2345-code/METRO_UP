"use client";

import Link from "next/link";
import { ArrowRight, GraduationCap } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { fetchAcademyState } from "@/lib/api/content-client";
import { useQuery, QUERY_POLICY } from "@/lib/client/query-cache";
import { cacheKeys } from "@/lib/client/cache-keys";

/**
 * "Продолжить обучение" — the next available, not-completed PUBLISHED lesson from
 * PostgreSQL. CTA links straight to /academy/lesson/[slug]. After a lesson is
 * completed it re-resolves to the next one. Uses NO mock lesson data.
 *
 * Sprint: manual-test-round-2, section 4 — only ever rendered inside the
 * PERSONAL Home context (home/page.tsx), so it explicitly requests the
 * MANAGER Academy section — never a role-section this card has no UI to
 * disambiguate for.
 *
 * Sprint: LIVE QA FIX QA-01B — read through the shared query cache instead
 * of a private useState+useEffect fetch. The private fetch had no cache at
 * all, so this card painted its own skeleton on EVERY return to Home — part
 * of the MANAGER Home flicker. Same fetcher, same section, same three
 * render outcomes; the skeleton now only appears when there is genuinely
 * nothing cached yet. Freshness: stale-while-revalidate like every other
 * cached Home surface (revalidated on mount), and lesson completion's
 * existing invalidatePrefix(cacheKeyPrefixes.academy) covers this key. A
 * failed request with nothing cached renders the same honest fallback card
 * the old `.catch(() => setState(null))` did; a failed background refresh
 * keeps showing the cached lesson rather than replacing it with that
 * fallback.
 */
export function ContinueLearningCard() {
  const { data, error } = useQuery(
    cacheKeys.academyState("MANAGER"),
    () => fetchAcademyState("MANAGER"),
    QUERY_POLICY.MEDIUM,
  );
  const state = data ?? null;

  if (data === undefined && error === undefined) {
    return <div className="h-24 w-full animate-pulse rounded-3xl bg-muted" />;
  }

  if (state?.nextLesson) {
    return (
      <Link href={`/academy/lesson/${state.nextLesson.slug}`} className="block">
        <GlassCard variant="solid" pad="md" animateIn={false} interactive className="flex items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-brand/12">
            <GraduationCap className="size-5 text-brand" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-muted-foreground">Следующий урок</p>
            <p className="truncate font-semibold">{state.nextLesson.title}</p>
          </div>
          <ArrowRight className="size-5 shrink-0 text-muted-foreground" />
        </GlassCard>
      </Link>
    );
  }

  const anyLessons = (state?.lessons.length ?? 0) > 0;
  return (
    <Link href="/academy" className="block">
      <GlassCard variant="solid" pad="md" animateIn={false} interactive className="flex items-center gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-brand/12">
          <GraduationCap className="size-5 text-brand" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{anyLessons ? "Все доступные уроки пройдены" : "Скоро появятся уроки"}</p>
          <p className="text-sm text-muted-foreground">Открыть Академию</p>
        </div>
        <ArrowRight className="size-5 shrink-0 text-muted-foreground" />
      </GlassCard>
    </Link>
  );
}
