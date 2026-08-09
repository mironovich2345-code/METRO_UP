"use client";

import { useRef, useState } from "react";
import { Maximize2, Play, RefreshCw, VideoOff } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Responsive 16:9 lesson video. Works across iOS/Android Telegram, Telegram
 * Desktop and browsers: playsInline (no forced fullscreen on iOS), native
 * controls, preload="metadata", poster, loading + error + retry states, and an
 * explicit fullscreen affordance. Never autoplays with sound.
 */
export function VideoLessonPlayer({
  url,
  posterUrl,
  caption,
}: {
  url: string | null;
  posterUrl?: string | null;
  caption?: string | null;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">(url ? "loading" : "error");
  const [reloadKey, setReloadKey] = useState(0);

  const retry = () => {
    setState("loading");
    setReloadKey((k) => k + 1);
  };

  const goFullscreen = () => {
    const el = videoRef.current;
    if (!el) return;
    // iOS Safari/Telegram: webkitEnterFullscreen on the <video>; others: element.
    const anyEl = el as HTMLVideoElement & { webkitEnterFullscreen?: () => void };
    if (anyEl.webkitEnterFullscreen) anyEl.webkitEnterFullscreen();
    else if (containerRef.current?.requestFullscreen) void containerRef.current.requestFullscreen();
  };

  if (!url) {
    return (
      <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-3xl bg-muted text-muted-foreground">
        <VideoOff className="size-7" />
        <span className="text-sm">Видео недоступно</span>
      </div>
    );
  }

  return (
    <figure className="w-full">
      <div
        ref={containerRef}
        className="relative w-full overflow-hidden rounded-3xl bg-black shadow-[var(--shadow-card)]"
      >
        <video
          key={reloadKey}
          ref={videoRef}
          className="aspect-video w-full max-w-full bg-black"
          controls
          playsInline
          preload="metadata"
          poster={posterUrl ?? undefined}
          onLoadedMetadata={() => setState("ready")}
          onCanPlay={() => setState("ready")}
          onError={() => setState("error")}
        >
          <source src={url} />
        </video>

        {state === "loading" && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/30">
            <span className="flex size-12 items-center justify-center rounded-full bg-brand text-brand-foreground">
              <Play className="size-5" />
            </span>
          </div>
        )}

        {state === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 text-white">
            <VideoOff className="size-7" />
            <p className="text-sm">Не удалось загрузить видео</p>
            <button
              onClick={retry}
              className="flex items-center gap-2 rounded-2xl bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground"
            >
              <RefreshCw className="size-4" /> Повторить
            </button>
          </div>
        )}

        {state === "ready" && (
          <button
            onClick={goFullscreen}
            aria-label="На весь экран"
            className="absolute right-3 top-3 flex size-9 items-center justify-center rounded-xl bg-black/50 text-white backdrop-blur"
          >
            <Maximize2 className="size-4" />
          </button>
        )}
      </div>
      {caption && (
        <figcaption className={cn("mt-2 px-1 text-center text-sm text-muted-foreground")}>{caption}</figcaption>
      )}
    </figure>
  );
}
