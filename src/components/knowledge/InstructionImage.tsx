"use client";

import { useEffect, useState } from "react";
import { ImageOff, X } from "lucide-react";

/**
 * A single instruction screenshot with a simple click-to-enlarge viewer.
 *
 * `url` is a server-resolved delivery URL (never user-supplied raw text), and alt/
 * caption are rendered as escaped React text — so there is no XSS surface. The
 * image is width-capped to the content area with height auto (no distortion, no
 * horizontal page scroll). Tapping opens a lightbox (Esc / backdrop / button to
 * close, scrolls when the image is tall, respects safe-area on mobile).
 */
export function InstructionImage({ url, alt, caption }: { url: string | null; alt: string | null; caption: string | null }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!url) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-dashed border-border bg-muted/40 px-4 py-6 text-sm text-muted-foreground">
        <ImageOff className="size-4 shrink-0" />
        <span>Изображение недоступно{caption ? `: ${caption}` : ""}</span>
      </div>
    );
  }

  return (
    <figure className="my-1">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={alt || caption || "Открыть изображение крупнее"}
        className="block w-full overflow-hidden rounded-2xl border border-border bg-card"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={alt ?? ""} loading="lazy" className="h-auto w-full object-contain" />
      </button>
      {caption && <figcaption className="mt-1.5 px-1 text-xs text-muted-foreground">{caption}</figcaption>}

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={alt || caption || "Изображение"}
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-[60] flex items-center justify-center overflow-auto bg-black/85 p-[max(16px,env(safe-area-inset-top))_max(16px,env(safe-area-inset-right))_max(16px,env(safe-area-inset-bottom))_max(16px,env(safe-area-inset-left))]"
        >
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setOpen(false); }}
            aria-label="Закрыть"
            className="fixed right-3 top-[max(12px,env(safe-area-inset-top))] z-[61] flex size-10 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur hover:bg-white/25"
          >
            <X className="size-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={alt ?? ""}
            onClick={(e) => e.stopPropagation()}
            className="mx-auto my-auto h-auto max-h-none w-auto max-w-full rounded-lg"
          />
        </div>
      )}
    </figure>
  );
}
