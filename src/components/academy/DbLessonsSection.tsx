"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { CheckCircle2, Lock, PlayCircle } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { SectionHeader } from "@/components/ui/section-header";
import { cardIn } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/telegram";
import { fetchAcademyState } from "@/lib/api/content-client";
import type { AcademyStateDTO } from "@/lib/api/content-types";

/**
 * DB-backed real lessons on the Academy screen. Rendered only when the backend
 * has published lessons for this user — otherwise it renders nothing and the
 * legacy mock sections remain the fallback (section 30: gradual switch).
 */
export function DbLessonsSection() {
  const router = useRouter();
  const [state, setState] = useState<AcademyStateDTO | null>(null);

  useEffect(() => {
    fetchAcademyState().then(setState).catch(() => setState(null));
  }, []);

  if (!state || state.lessons.length === 0) return null;

  return (
    <motion.div variants={cardIn} className="mt-6">
      <SectionHeader title="Активные уроки" />
      <div className="mt-3 space-y-2">
        {state.lessons.map((l) => {
          const done = l.status === "COMPLETED";
          return (
            <GlassCard
              key={l.lessonId}
              variant="solid"
              pad="md"
              animateIn={false}
              interactive={!l.locked}
              onClick={() => {
                if (l.locked) return;
                haptic("medium");
                router.push(`/academy/lesson/${l.slug}`);
              }}
              className={cn("flex items-center gap-3", l.locked && "opacity-60")}
            >
              <span
                className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-2xl",
                  done ? "bg-success text-white" : l.locked ? "bg-muted text-muted-foreground" : "bg-brand/12 text-brand",
                )}
              >
                {done ? <CheckCircle2 className="size-5" /> : l.locked ? <Lock className="size-4" /> : <PlayCircle className="size-5" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{l.title}</p>
                <p className="text-xs text-muted-foreground">
                  {done ? "Завершён" : l.locked ? "Откроется позже" : "Доступен"}
                </p>
              </div>
            </GlassCard>
          );
        })}
      </div>
    </motion.div>
  );
}
