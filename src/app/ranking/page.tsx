"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowDown, ArrowUp, Crown, Trophy } from "lucide-react";
import { BottomNavigation } from "@/components/bottom-navigation";
import { AppHeader } from "@/components/app-header";
import { GlassCard } from "@/components/ui/glass-card";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cardIn, staggerStack } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { fetchRatingBoard } from "@/lib/api/home-client";
import type { RatingBoardDTO, RatingBoardRowDTO } from "@/lib/api/home-types";

/**
 * Monthly rating — only the latest PUBLISHED period, only real users from
 * PostgreSQL. No mock employees, no invented ranks/scores. Honest empty state
 * until a rating is published.
 */
export default function RankingScreen() {
  const [board, setBoard] = useState<RatingBoardDTO | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  const load = () => {
    setStatus("loading");
    fetchRatingBoard()
      .then((b) => {
        setBoard(b);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  };
  useEffect(load, []);

  return (
    <div className="relative min-h-[100dvh] pb-32">
      <AppHeader title="Рейтинг" subtitle={board?.hasData ? board.periodLabel : "Ежемесячный рейтинг"} />

      <motion.main variants={staggerStack} initial="hidden" animate="show" className="px-5">
        {status === "loading" && (
          <div className="space-y-3">
            <div className="h-16 w-full animate-pulse rounded-3xl bg-muted" />
            <div className="h-16 w-full animate-pulse rounded-3xl bg-muted" />
            <div className="h-16 w-full animate-pulse rounded-3xl bg-muted" />
          </div>
        )}

        {status === "error" && (
          <div className="mt-16 text-center">
            <p className="font-semibold">Не удалось загрузить рейтинг</p>
            <Button className="mt-4" variant="secondary" onClick={load}>Повторить</Button>
          </div>
        )}

        {status === "ready" && board && !board.hasData && (
          <motion.div variants={cardIn} className="mt-10">
            <GlassCard variant="solid" pad="lg" animateIn={false} className="text-center">
              <span className="mx-auto mb-3 flex size-12 items-center justify-center rounded-2xl bg-brand/12">
                <Trophy className="size-6 text-brand" />
              </span>
              <p className="font-semibold">Рейтинг пока не сформирован</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Здесь появятся результаты после публикации первого рейтинга.
              </p>
            </GlassCard>
          </motion.div>
        )}

        {status === "ready" && board && board.hasData && (
          <>
            <div className="space-y-2">
              {board.top.map((row) => (
                <motion.div key={row.rank} variants={cardIn}>
                  <RatingRowItem row={row} />
                </motion.div>
              ))}
              {board.top.length === 0 && (
                <p className="mt-10 text-center text-sm text-muted-foreground">
                  В этом периоде пока нет участников рейтинга.
                </p>
              )}
            </div>

            {board.currentUser && !board.currentUserInTop && (
              <motion.div variants={cardIn} className="mt-4">
                <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Твоё место
                </p>
                <RatingRowItem row={board.currentUser} />
              </motion.div>
            )}

            {!board.currentUserInTop && !board.currentUser && (
              <motion.div variants={cardIn} className="mt-4">
                <GlassCard variant="outline" pad="md" animateIn={false} className="text-center text-sm text-muted-foreground">
                  В этом рейтинге у тебя пока нет результата.
                </GlassCard>
              </motion.div>
            )}
          </>
        )}
      </motion.main>

      <BottomNavigation />
    </div>
  );
}

function RatingRowItem({ row }: { row: RatingBoardRowDTO }) {
  const medal = row.rank <= 3;
  return (
    <GlassCard
      variant={row.isCurrentUser ? "brand" : "solid"}
      pad="md"
      animateIn={false}
      className="flex items-center gap-3"
    >
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-2xl text-sm font-extrabold",
          row.isCurrentUser ? "bg-brand-foreground/10 text-brand-foreground" : medal ? "bg-brand/15 text-brand" : "bg-muted text-muted-foreground",
        )}
      >
        {medal ? <Crown className="size-4" /> : row.rank}
      </span>
      <Avatar name={row.displayName} size={40} />
      <div className="min-w-0 flex-1">
        <p className={cn("truncate font-semibold", row.isCurrentUser && "text-brand-foreground")}>{row.displayName}</p>
        {row.clubName && (
          <p className={cn("truncate text-xs", row.isCurrentUser ? "text-brand-foreground/70" : "text-muted-foreground")}>
            {row.clubName}
          </p>
        )}
      </div>
      <div className="text-right">
        <p className={cn("font-bold", row.isCurrentUser && "text-brand-foreground")}>{row.finalScore.toFixed(1)}</p>
        {row.delta != null && row.delta !== 0 && (
          <span className={cn("inline-flex items-center gap-0.5 text-xs font-semibold", row.delta > 0 ? "text-success" : "text-red-500")}>
            {row.delta > 0 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
            {Math.abs(row.delta)}
          </span>
        )}
      </div>
    </GlassCard>
  );
}
