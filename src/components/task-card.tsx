"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Check, Clock, Zap } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import type { DailyTask } from "@/lib/types";
import { cn } from "@/lib/utils";
import { haptic, hapticSuccess } from "@/lib/telegram";
import { springSoft } from "@/lib/motion";

export function TaskCard({ task }: { task: DailyTask }) {
  const [done, setDone] = useState(task.done);

  const toggle = () => {
    const next = !done;
    setDone(next);
    if (next) hapticSuccess();
    else haptic("light");
  };

  return (
    <GlassCard
      variant={done ? "outline" : "solid"}
      pad="sm"
      interactive
      onClick={toggle}
      className={cn(done && "opacity-80")}
    >
      <div className="flex items-center gap-3">
        <motion.button
          type="button"
          whileTap={{ scale: 0.85 }}
          transition={springSoft}
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
            done
              ? "border-success bg-success text-white"
              : "border-border-strong text-transparent",
          )}
          aria-label={done ? "Отметить невыполненным" : "Отметить выполненным"}
        >
          <motion.span
            initial={false}
            animate={{ scale: done ? 1 : 0 }}
            transition={springSoft}
          >
            <Check className="size-5" strokeWidth={3} />
          </motion.span>
        </motion.button>

        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "truncate text-[15px] font-semibold text-foreground",
              done && "line-through decoration-muted-foreground/50",
            )}
          >
            {task.title}
          </p>
          <div className="mt-0.5 flex items-center gap-3 text-xs font-medium text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3.5" />
              {task.durationMin} мин
            </span>
            <span className="inline-flex items-center gap-1 text-foreground">
              <Zap className="size-3.5 fill-brand text-brand" />+{task.xp} XP
            </span>
          </div>
        </div>
      </div>
    </GlassCard>
  );
}
