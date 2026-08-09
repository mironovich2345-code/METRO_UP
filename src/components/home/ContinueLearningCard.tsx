"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { GraduationCap } from "lucide-react";
import { LessonCard } from "@/components/lesson-card";
import { fetchAcademyState } from "@/lib/api/content-client";
import type { AcademyStateDTO } from "@/lib/api/content-types";

/**
 * "Продолжить обучение" — prefers the next available DB lesson when the vertical
 * flow has real content; otherwise renders the provided legacy mock fallback.
 */
export function ContinueLearningCard({ fallback }: { fallback: React.ReactNode }) {
  const [state, setState] = useState<AcademyStateDTO | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetchAcademyState()
      .then(setState)
      .catch(() => setState(null))
      .finally(() => setLoaded(true));
  }, []);

  if (loaded && state?.nextLesson) {
    return (
      <Link href={`/academy/lesson/${state.nextLesson.slug}`}>
        <LessonCard
          courseTitle="Академия Metro UP"
          lessonTitle={state.nextLesson.title}
          icon={GraduationCap}
          progress={0}
        />
      </Link>
    );
  }
  return <>{fallback}</>;
}
