"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { Crown, TrendingUp, TrendingDown } from "lucide-react";
import { BottomNavigation } from "@/components/bottom-navigation";
import { AppHeader } from "@/components/app-header";
import { GlassCard } from "@/components/ui/glass-card";
import { Avatar } from "@/components/ui/avatar";
import { getPublishedBoard, type RatingRow } from "@/domain/rating";
import { getClubById } from "@/content";
import { useApp } from "@/providers/app-provider";
import { cardIn, staggerStack } from "@/lib/motion";
import { cn } from "@/lib/utils";

const medalColor = (rank: number) => {
  if (rank === 1) return "text-amber-400";
  if (rank === 2) return "text-zinc-400";
  if (rank === 3) return "text-orange-400";
  return "text-muted-foreground";
};

function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta === null || delta === 0) return null;
  const up = delta > 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 whitespace-nowrap text-[11px] font-bold",
        up ? "text-emerald-500" : "text-red-500",
      )}
    >
      {up ? (
        <TrendingUp className="size-3" />
      ) : (
        <TrendingDown className="size-3" />
      )}
      {up ? `+${delta}` : delta}
    </span>
  );
}

function RatingRowItem({
  row,
  name,
  highlight,
}: {
  row: RatingRow;
  name: string;
  highlight?: boolean;
}) {
  const club = getClubById(row.employee.clubId);
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-2xl px-2 py-2.5",
        highlight && "bg-brand/10",
      )}
    >
      <div className="flex w-7 shrink-0 items-center justify-center">
        {row.rank <= 3 ? (
          <Crown
            className={cn("size-5", medalColor(row.rank))}
            fill="currentColor"
          />
        ) : (
          <span className="text-sm font-bold text-muted-foreground">
            {row.rank}
          </span>
        )}
      </div>
      <Avatar name={name} size={40} ring={highlight} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold text-foreground">
          {name}
        </p>
        {club && (
          <p className="truncate text-xs font-medium text-muted-foreground">
            {club.name}
          </p>
        )}
      </div>
      <div className="flex flex-col items-end">
        <span className="whitespace-nowrap text-sm font-bold text-foreground">
          {row.finalScore.toFixed(1)}
        </span>
        <DeltaBadge delta={row.delta} />
      </div>
    </div>
  );
}

export default function RankingScreen() {
  const { profile } = useApp();
  const board = useMemo(() => getPublishedBoard(), []);

  return (
    <div className="relative min-h-[100dvh] pb-32">
      <AppHeader title="Рейтинг" subtitle="Итоги месяца" />

      {!board ? (
        <div className="px-5">
          <GlassCard variant="solid" pad="lg" animateIn={false}>
            <p className="text-sm font-medium text-muted-foreground">
              Рейтинг за прошлый месяц ещё не опубликован. Он появится, как
              только итоги будут подтверждены.
            </p>
          </GlassCard>
        </div>
      ) : (
        <motion.main
          variants={staggerStack}
          initial="hidden"
          animate="show"
          className="flex flex-col gap-5 px-5"
        >
          {/* Period */}
          <motion.div variants={cardIn}>
            <GlassCard variant="brand" pad="lg" animateIn={false}>
              <div className="pointer-events-none absolute -right-8 -top-10 size-36 rounded-full bg-white/20 blur-2xl" />
              <div className="relative">
                <p className="text-xs font-semibold uppercase tracking-wider text-brand-foreground/60">
                  Итоги месяца
                </p>
                <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-brand-foreground">
                  {board.label}
                </h2>
                <p className="mt-1 text-sm font-medium text-brand-foreground/80">
                  ТОП-10 сотрудников сети
                </p>
              </div>
            </GlassCard>
          </motion.div>

          {/* Top 10 */}
          <motion.div variants={cardIn}>
            <GlassCard variant="solid" pad="sm" animateIn={false}>
              <ul className="flex flex-col">
                {board.top.map((row) => (
                  <li key={row.employee.id}>
                    <RatingRowItem
                      row={row}
                      name={row.isCurrentUser ? "Вы" : row.employee.name}
                      highlight={row.isCurrentUser}
                    />
                  </li>
                ))}
              </ul>
            </GlassCard>
          </motion.div>

          {/* Current user — only when outside the top 10 */}
          {board.currentUser && !board.currentUserInTop && (
            <motion.div variants={cardIn}>
              <GlassCard
                variant="solid"
                pad="lg"
                animateIn={false}
                className="border-2 border-brand"
              >
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Ты
                </p>
                <div className="mt-2 flex items-center gap-4">
                  <Avatar name={profile?.displayName ?? "Вы"} size={52} ring />
                  <div className="flex-1">
                    <p className="text-2xl font-extrabold leading-none text-foreground">
                      {board.currentUser.rank} место
                    </p>
                    <p className="mt-1 text-sm font-semibold text-foreground">
                      {board.currentUser.finalScore.toFixed(1)} балла
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <DeltaBadge delta={board.currentUser.delta} />
                    <span className="text-[11px] font-medium text-muted-foreground">
                      к прошлому месяцу
                    </span>
                  </div>
                </div>
              </GlassCard>
            </motion.div>
          )}
        </motion.main>
      )}

      <BottomNavigation />
    </div>
  );
}
