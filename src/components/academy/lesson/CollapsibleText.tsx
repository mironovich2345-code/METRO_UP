"use client";

import { useId, useState } from "react";
import { ChevronDown, FileText } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { cn } from "@/lib/utils";
import { hapticSelection } from "@/lib/telegram";
import type { RichDoc } from "@/lib/server/content-schemas";
import { RichText } from "./RichText";

/**
 * Full text version of the lesson, shown under the video as an accessible
 * accordion. Expansion state is local (never persisted). Real <button> semantics
 * with aria-expanded / aria-controls; the content is a semantic region.
 */
export function CollapsibleText({
  title,
  doc,
  defaultExpanded,
}: {
  title: string;
  doc: RichDoc;
  defaultExpanded: boolean;
}) {
  const [open, setOpen] = useState(defaultExpanded);
  const panelId = useId();

  return (
    <GlassCard variant="solid" pad="none" animateIn={false} className="overflow-hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          hapticSelection();
          setOpen((v) => !v);
        }}
        className="flex w-full items-center gap-3 px-5 py-4 text-left"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-2xl bg-brand/12">
          <FileText className="size-5 text-brand" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold text-foreground">{title}</span>
          <span className="block text-xs text-muted-foreground">{open ? "Свернуть" : "Развернуть"}</span>
        </span>
        <ChevronDown className={cn("size-5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      <div id={panelId} role="region" aria-label={title} hidden={!open} className="px-5 pb-5">
        <RichText doc={doc} />
      </div>
    </GlassCard>
  );
}
