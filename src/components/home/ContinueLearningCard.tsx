"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, GraduationCap } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { fetchAcademyState } from "@/lib/api/content-client";
import type { AcademyStateDTO } from "@/lib/api/content-types";

/**
 * "Продолжить обучение" — the next available, not-completed PUBLISHED lesson from
 * PostgreSQL. CTA links straight to /academy/lesson/[slug]. After a lesson is
 * completed it re-resolves to the next one. Uses NO mock lesson data.
 */
export function ContinueLearningCard() {
  const [state, setState] = useState<AcademyStateDTO | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetchAcademyState()
      .then(setState)
      .catch(() => setState(null))
      .finally(() => setLoaded(true));
  }, []);

  if (!loaded) {
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
