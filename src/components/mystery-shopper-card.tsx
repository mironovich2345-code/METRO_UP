"use client";

import { motion } from "framer-motion";
import { MapPin } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import type { MysteryShopperResult } from "@/lib/types";
import { easeOutSoft } from "@/lib/motion";

function ScoreRing({ score }: { score: number }) {
  const r = 30;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - score / 100);

  return (
    <div className="relative size-[76px] shrink-0">
      <svg viewBox="0 0 76 76" className="size-full -rotate-90">
        <circle
          cx="38"
          cy="38"
          r={r}
          fill="none"
          strokeWidth="7"
          className="stroke-muted"
        />
        <motion.circle
          cx="38"
          cy="38"
          r={r}
          fill="none"
          strokeWidth="7"
          strokeLinecap="round"
          className="stroke-brand"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          whileInView={{ strokeDashoffset: offset }}
          viewport={{ once: true }}
          transition={{ duration: 1.1, ease: easeOutSoft }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-extrabold leading-none text-foreground">
          {score}
        </span>
        <span className="text-[10px] font-semibold text-muted-foreground">
          балл
        </span>
      </div>
    </div>
  );
}

export function MysteryShopperCard({
  result,
}: {
  result: MysteryShopperResult;
}) {
  return (
    <GlassCard variant="solid" pad="md">
      <div className="flex items-center gap-4">
        <ScoreRing score={result.score} />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Тайный покупатель
          </p>
          <div className="mt-1 flex items-center gap-1.5 text-[15px] font-bold text-foreground">
            <MapPin className="size-4 text-brand" />
            {result.club}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{result.date}</p>
        </div>
      </div>

      <ul className="mt-4 flex flex-col gap-2 border-t border-border pt-4">
        {result.highlights.map((h, i) => (
          <li
            key={i}
            className="flex items-start gap-2 text-sm text-muted-foreground"
          >
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand" />
            {h}
          </li>
        ))}
      </ul>
    </GlassCard>
  );
}
