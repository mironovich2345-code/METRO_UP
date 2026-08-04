"use client";

import { motion } from "framer-motion";
import { TrendingUp } from "lucide-react";
import { BottomNavigation } from "@/components/bottom-navigation";
import { AppHeader } from "@/components/app-header";
import { GlassCard } from "@/components/ui/glass-card";
import { RankingCard } from "@/components/ranking-card";
import { RANKING } from "@/lib/data";
import { formatNumber } from "@/lib/utils";
import { cardIn, staggerStack } from "@/lib/motion";

export default function RankingScreen() {
  const me = RANKING.find((r) => r.isCurrentUser)!;
  const ahead = RANKING.find((r) => r.position === me.position - 1);
  const gap = ahead ? ahead.xp - me.xp : 0;

  return (
    <div className="relative min-h-[100dvh] pb-32">
      <AppHeader title="Рейтинг" subtitle="Твоё место в сети Metro" />

      <motion.main
        variants={staggerStack}
        initial="hidden"
        animate="show"
        className="flex flex-col gap-5 px-5"
      >
        <motion.div variants={cardIn}>
          <GlassCard variant="brand" pad="lg" animateIn={false}>
            <div className="pointer-events-none absolute -right-8 -top-10 size-36 rounded-full bg-white/20 blur-2xl" />
            <div className="relative flex items-center gap-4">
              <div className="flex size-16 items-center justify-center rounded-2xl bg-black/10">
                <span className="text-2xl font-extrabold text-brand-foreground">
                  {me.position}
                </span>
              </div>
              <div className="flex-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-brand-foreground/60">
                  Твоя позиция
                </p>
                <p className="text-xl font-extrabold text-brand-foreground">
                  {formatNumber(me.xp)} XP
                </p>
              </div>
            </div>
            {gap > 0 && (
              <div className="relative mt-4 flex items-center gap-2 rounded-2xl bg-black/10 px-4 py-3">
                <TrendingUp className="size-4 text-brand-foreground" />
                <p className="text-sm font-semibold text-brand-foreground">
                  Ещё {formatNumber(gap)} XP до {me.position - 1} места
                </p>
              </div>
            )}
          </GlassCard>
        </motion.div>

        <motion.div variants={cardIn}>
          <RankingCard entries={RANKING} />
        </motion.div>
      </motion.main>

      <BottomNavigation />
    </div>
  );
}
