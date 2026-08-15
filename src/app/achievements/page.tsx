"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Lock } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { resolveIcon } from "@/lib/icons";
import { cardIn, staggerStack } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { fetchAchievements } from "@/lib/api/home-client";
import type { AchievementDTO } from "@/lib/api/home-types";

const CATEGORY_LABEL: Record<string, string> = {
  LEARNING: "Обучение", RATING: "Рейтинг", MYSTERY: "Тайный покупатель", SALES: "Продажи",
};

export default function AchievementsPage() {
  const [items, setItems] = useState<AchievementDTO[] | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  const load = () => {
    setStatus("loading");
    fetchAchievements().then((r) => { setItems(r.achievements); setStatus("ready"); }).catch(() => setStatus("error"));
  };
  useEffect(load, []);

  const earned = items?.filter((a) => a.awarded) ?? [];
  const locked = items?.filter((a) => !a.awarded) ?? [];

  return (
    <div className="relative min-h-[100dvh] pb-24">
      <AppHeader title="Достижения" subtitle={items ? `Получено ${earned.length} из ${items.length}` : undefined} showBack backHref="/home" showThemeSwitcher={false} />

      <motion.main variants={staggerStack} initial="hidden" animate="show" className="px-5">
        {status === "loading" && <div className="mt-4 grid grid-cols-2 gap-3">{[0, 1, 2, 3].map((i) => <div key={i} className="h-28 animate-pulse rounded-3xl bg-muted" />)}</div>}
        {status === "error" && <div className="mt-16 text-center"><p className="font-semibold">Не удалось загрузить</p><Button className="mt-4" variant="secondary" onClick={load}>Повторить</Button></div>}

        {status === "ready" && items && (
          <>
            {earned.length > 0 && (
              <>
                <motion.p variants={cardIn} className="mt-2 px-1 text-sm font-bold">Получено</motion.p>
                <div className="mt-2 grid grid-cols-2 gap-3">
                  {earned.map((a) => <motion.div key={a.code} variants={cardIn}><AchievementCard a={a} /></motion.div>)}
                </div>
              </>
            )}
            <motion.p variants={cardIn} className="mt-6 px-1 text-sm font-bold text-muted-foreground">Заблокировано</motion.p>
            <div className="mt-2 grid grid-cols-2 gap-3">
              {locked.map((a) => <motion.div key={a.code} variants={cardIn}><AchievementCard a={a} /></motion.div>)}
            </div>
          </>
        )}
      </motion.main>
    </div>
  );
}

function AchievementCard({ a }: { a: AchievementDTO }) {
  const Icon = a.awarded ? resolveIcon(a.icon) : Lock;
  return (
    <GlassCard variant={a.awarded ? "solid" : "outline"} pad="md" animateIn={false} className={cn("h-full", !a.awarded && "opacity-70")}>
      <span className={cn("flex size-10 items-center justify-center rounded-2xl", a.awarded ? "bg-brand/15 text-brand" : "bg-muted text-muted-foreground")}>
        <Icon className="size-5" />
      </span>
      <p className="mt-3 font-bold leading-tight">{a.title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{a.description}</p>
      <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{CATEGORY_LABEL[a.category] ?? a.category}</p>
    </GlassCard>
  );
}
