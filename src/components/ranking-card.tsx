"use client";

import { motion } from "framer-motion";
import { Crown } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { Avatar } from "@/components/ui/avatar";
import { formatNumber, cn } from "@/lib/utils";
import type { RankingEntry } from "@/lib/types";

interface RankingCardProps {
  entries: RankingEntry[];
}

const medalColor = (position: number) => {
  if (position === 1) return "text-amber-400";
  if (position === 2) return "text-zinc-400";
  if (position === 3) return "text-orange-400";
  return "text-muted-foreground";
};

export function RankingCard({ entries }: RankingCardProps) {
  return (
    <GlassCard variant="solid" pad="sm">
      <ul className="flex flex-col">
        {entries.map((entry, i) => (
          <motion.li
            key={entry.id}
            initial={{ opacity: 0, x: -8 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.06 }}
            className={cn(
              "flex items-center gap-3 rounded-2xl px-2 py-2.5",
              entry.isCurrentUser && "bg-brand/10",
            )}
          >
            <div className="flex w-6 shrink-0 items-center justify-center">
              {entry.position <= 3 ? (
                <Crown
                  className={cn("size-5", medalColor(entry.position))}
                  fill="currentColor"
                />
              ) : (
                <span className="text-sm font-bold text-muted-foreground">
                  {entry.position}
                </span>
              )}
            </div>

            <Avatar name={entry.name} size={38} ring={entry.isCurrentUser} />

            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  "truncate text-[15px] font-semibold",
                  entry.isCurrentUser ? "text-foreground" : "text-foreground",
                )}
              >
                {entry.name}
              </p>
              <p className="text-xs font-medium text-muted-foreground">
                {formatNumber(entry.xp)} XP
              </p>
            </div>

            {entry.isCurrentUser && (
              <span className="rounded-full bg-brand px-2.5 py-1 text-[11px] font-bold text-brand-foreground">
                Вы
              </span>
            )}
          </motion.li>
        ))}
      </ul>
    </GlassCard>
  );
}
