"use client";

import { ArrowUpRight } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { Badge } from "@/components/ui/badge";
import type { NewsItem } from "@/lib/types";
import { haptic } from "@/lib/telegram";

export function NewsCard({ item }: { item: NewsItem }) {
  return (
    <GlassCard
      variant="solid"
      pad="md"
      interactive
      onClick={() => haptic("light")}
      className="min-w-[260px] max-w-[280px] snap-start"
    >
      <div className="flex items-center justify-between">
        <Badge variant="brand" size="sm">
          {item.tag}
        </Badge>
        <span className="text-xs font-medium text-muted-foreground">
          {item.date}
        </span>
      </div>

      <h3 className="mt-3 text-[15px] font-bold leading-snug text-foreground">
        {item.title}
      </h3>
      <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">
        {item.excerpt}
      </p>

      <div className="mt-4 flex items-center gap-1 text-sm font-semibold text-foreground">
        Читать
        <ArrowUpRight className="size-4" />
      </div>
    </GlassCard>
  );
}
