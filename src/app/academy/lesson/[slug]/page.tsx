"use client";

import { useCallback } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { RevalidatingBar } from "@/components/ui/revalidating-bar";
import { fetchLesson } from "@/lib/api/content-client";
import { ApiError } from "@/lib/api/client";
import { useQuery, QUERY_POLICY } from "@/lib/client/query-cache";
import { cacheKeys } from "@/lib/client/cache-keys";
import { LessonRenderer } from "@/components/academy/lesson/LessonRenderer";

/** Employee lesson player. `?preview=1` renders the CMS admin preview (no writes). */
export default function LessonPage() {
  const params = useParams<{ slug: string }>();
  const search = useSearchParams();
  const preview = search.get("preview") === "1";
  const slug = params.slug;

  const fetchThisLesson = useCallback(() => fetchLesson(slug, { preview }), [slug, preview]);
  const { data: lesson, error, isLoading, isValidating, mutate } = useQuery(
    cacheKeys.academyLesson(slug, preview),
    fetchThisLesson,
    // MEDIUM, not LONG: like the day/overview screens, this mixes published
    // content with this user's own completed state; LessonRenderer/QuizFlow
    // force-invalidate academy:* on every real completion regardless.
    QUERY_POLICY.MEDIUM,
  );
  const status: "loading" | "ready" | "notfound" | "error" =
    error instanceof ApiError && error.status === 404
      ? "notfound"
      : error
        ? "error"
        : !lesson && isLoading
          ? "loading"
          : lesson
            ? "ready"
            : "loading";

  return (
    <div className="relative min-h-[100dvh] pb-24">
      <AppHeader
        title={preview ? "Предпросмотр" : "Урок"}
        subtitle={lesson?.title}
        showBack
        backHref={preview ? undefined : "/academy"}
        showThemeSwitcher={false}
      />
      <RevalidatingBar show={Boolean(lesson) && isValidating} />
      <main className="px-5">
        {status === "loading" && (
          <div className="space-y-4">
            <div className="h-28 w-full animate-pulse rounded-3xl bg-muted" />
            <div className="aspect-video w-full animate-pulse rounded-3xl bg-muted" />
            <div className="h-24 w-full animate-pulse rounded-3xl bg-muted" />
          </div>
        )}

        {status === "notfound" && (
          <div className="mt-10 text-center">
            <p className="font-semibold">Урок не найден</p>
            <p className="mt-1 text-sm text-muted-foreground">Возможно, он ещё не опубликован</p>
          </div>
        )}

        {status === "error" && (
          <div className="mt-10 text-center">
            <p className="font-semibold">Не удалось загрузить урок</p>
            <Button className="mt-4" variant="secondary" onClick={() => mutate()}>
              Повторить
            </Button>
          </div>
        )}

        {status === "ready" && lesson && <LessonRenderer lesson={lesson} />}
      </main>
    </div>
  );
}
