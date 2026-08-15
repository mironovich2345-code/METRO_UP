import Image from "next/image";
import { CheckCircle2, Info, Lightbulb, ListChecks, Sparkles, Star, TriangleAlert } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { cn } from "@/lib/utils";
import { resolveIcon } from "@/lib/icons";
import type { InfoCardVariant, LessonBlockDTO, TakeawayVariant } from "@/lib/api/content-types";
import { VideoLessonPlayer } from "./VideoLessonPlayer";
import { RichText } from "./RichText";
import { CollapsibleText } from "./CollapsibleText";

const TAKEAWAY_STYLES: Record<TakeawayVariant, { box: string; iconWrap: string; fallback: typeof Star }> = {
  DEFAULT: { box: "border-border bg-card", iconWrap: "bg-brand/15 text-brand", fallback: Star },
  IMPORTANT: { box: "border-brand/40 bg-brand/8", iconWrap: "bg-brand text-brand-foreground", fallback: Sparkles },
  TIP: { box: "border-border bg-brand-soft", iconWrap: "bg-brand text-brand-foreground", fallback: Lightbulb },
};

const INFO_STYLES: Record<InfoCardVariant, { icon: typeof Info; box: string; iconWrap: string }> = {
  DEFAULT: { icon: Info, box: "bg-muted", iconWrap: "bg-foreground/10 text-foreground" },
  TIP: { icon: Lightbulb, box: "bg-brand-soft", iconWrap: "bg-brand text-brand-foreground" },
  IMPORTANT: { icon: Info, box: "bg-brand/12 border border-brand/30", iconWrap: "bg-brand text-brand-foreground" },
  WARNING: { icon: TriangleAlert, box: "bg-red-500/10 border border-red-500/30", iconWrap: "bg-red-500 text-white" },
};

/** Render a single lesson block. Pure/presentational — used by player & preview. */
export function LessonBlockRenderer({ block }: { block: LessonBlockDTO }) {
  switch (block.type) {
    case "VIDEO":
      return <VideoLessonPlayer url={block.url} posterUrl={block.posterUrl} caption={block.caption} />;

    case "IMAGE":
      return (
        <figure className="w-full">
          <div className="relative w-full overflow-hidden rounded-3xl bg-muted">
            {block.url ? (
              <Image
                src={block.url}
                alt={block.alt ?? ""}
                width={1280}
                height={720}
                className="h-auto w-full max-w-full object-cover"
                unoptimized
              />
            ) : (
              <div className="flex aspect-video items-center justify-center text-sm text-muted-foreground">
                Изображение недоступно
              </div>
            )}
          </div>
          {block.caption && (
            <figcaption className="mt-2 text-center text-sm text-muted-foreground">{block.caption}</figcaption>
          )}
        </figure>
      );

    case "TEXT":
      return <RichText doc={block.doc} />;

    case "COLLAPSIBLE_TEXT":
      return <CollapsibleText title={block.title} doc={block.doc} defaultExpanded={block.defaultExpanded} />;

    case "KEY_TAKEAWAYS":
      return (
        <section aria-label={block.title}>
          <p className="mb-3 flex items-center gap-2 text-lg font-bold">
            <Sparkles className="size-5 text-brand" /> {block.title}
          </p>
          <div className="grid gap-2.5">
            {block.items.map((it) => {
              const s = TAKEAWAY_STYLES[it.variant] ?? TAKEAWAY_STYLES.DEFAULT;
              const Icon = it.icon ? resolveIcon(it.icon) : s.fallback;
              return (
                <div key={it.id} className={cn("flex gap-3 rounded-2xl border p-3.5", s.box)}>
                  <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", s.iconWrap)}>
                    <Icon className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="font-bold leading-snug text-foreground">{it.title}</p>
                    <p className="mt-0.5 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{it.text.trim()}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      );

    case "INFO_CARD": {
      const s = INFO_STYLES[block.variant] ?? INFO_STYLES.DEFAULT;
      const Icon = s.icon;
      return (
        <div className={cn("flex gap-3 rounded-3xl p-4", s.box)}>
          <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-2xl", s.iconWrap)}>
            <Icon className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="font-semibold text-foreground">{block.title}</p>
            <p className="mt-1 whitespace-pre-line text-[15px] leading-relaxed text-muted-foreground">{block.text.trim()}</p>
          </div>
        </div>
      );
    }

    case "CHECKLIST":
      return (
        <GlassCard variant="solid" pad="md" animateIn={false}>
          {block.title && (
            <p className="mb-3 flex items-center gap-2 font-semibold">
              <ListChecks className="size-4 text-brand" /> {block.title}
            </p>
          )}
          <ul className="space-y-2">
            {block.items.map((it, i) => (
              <li key={i} className="flex items-start gap-2 text-[15px]">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
                <span>{it.text}</span>
              </li>
            ))}
          </ul>
        </GlassCard>
      );

    case "SUMMARY":
      return (
        <GlassCard variant="brand" pad="md" animateIn={false}>
          <p className="mb-2 font-bold text-brand-foreground">{block.title ?? "Итоги"}</p>
          <ul className="space-y-1.5">
            {block.points.map((p, i) => (
              <li key={i} className="flex items-start gap-2 text-[15px] text-brand-foreground/90">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-brand-foreground/70" />
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </GlassCard>
      );

    default:
      return null;
  }
}
