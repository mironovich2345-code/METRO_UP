"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { fetchLesson } from "@/lib/api/content-client";
import { ApiError } from "@/lib/api/client";
import type { LessonDetailDTO } from "@/lib/api/content-types";
import { LessonRenderer } from "@/components/academy/lesson/LessonRenderer";

/** Employee lesson player. `?preview=1` renders the CMS admin preview (no writes). */
export default function LessonPage() {
  const params = useParams<{ slug: string }>();
  const search = useSearchParams();
  const preview = search.get("preview") === "1";
  const slug = params.slug;

  const [lesson, setLesson] = useState<LessonDetailDTO | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "notfound" | "error">("loading");

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const l = await fetchLesson(slug, { preview });
      setLesson(l);
      setStatus("ready");
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setStatus("notfound");
      else setStatus("error");
    }
  }, [slug, preview]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="relative min-h-[100dvh] pb-24">
      <AppHeader
        title={preview ? "Предпросмотр" : "Урок"}
        subtitle={lesson?.title}
        showBack
        backHref={preview ? undefined : "/academy"}
        showThemeSwitcher={false}
      />
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
            <Button className="mt-4" variant="secondary" onClick={load}>
              Повторить
            </Button>
          </div>
        )}

        {status === "ready" && lesson && <LessonRenderer lesson={lesson} />}
      </main>
    </div>
  );
}
