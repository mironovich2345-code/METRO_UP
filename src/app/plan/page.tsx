"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { CheckCircle2, ChevronDown, ChevronRight, Circle, Clock, Lock } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { GlassCard } from "@/components/ui/glass-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { XPProgress } from "@/components/ui/xp-progress";
import { cardIn, staggerStack } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { haptic, hapticSelection, hapticSuccess } from "@/lib/telegram";
import { completePlanTask, fetchPlanToday, skipPlanTask, toggleChecklistItem } from "@/lib/api/home-client";
import type { DailyPlanDTO, DailyTaskDTO } from "@/lib/api/home-types";

export default function PlanScreen() {
  const [plan, setPlan] = useState<DailyPlanDTO | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      setPlan(await fetchPlanToday());
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const patchTask = (task: DailyTaskDTO) =>
    setPlan((p) => (p ? recompute({ ...p, tasks: p.tasks.map((t) => (t.id === task.id ? task : t)) }) : p));

  const dateLabel = plan
    ? new Date(plan.date).toLocaleDateString("ru-RU", { day: "numeric", month: "long", weekday: "long" })
    : "";
  const pct = plan && plan.total ? Math.round((plan.completed / plan.total) * 100) : 0;

  return (
    <div className="relative min-h-[100dvh] pb-24">
      <AppHeader title="План на сегодня" subtitle={dateLabel} showBack showThemeSwitcher={false} />

      <motion.main variants={staggerStack} initial="hidden" animate="show" className="px-5">
        {status === "loading" && (
          <div className="space-y-3">
            <div className="h-24 w-full animate-pulse rounded-3xl bg-muted" />
            <div className="h-20 w-full animate-pulse rounded-3xl bg-muted" />
          </div>
        )}

        {status === "error" && (
          <div className="mt-16 text-center">
            <p className="font-semibold">Не удалось загрузить план</p>
            <Button className="mt-4" variant="secondary" onClick={load}>Повторить</Button>
          </div>
        )}

        {status === "ready" && plan && (
          <>
            <motion.div variants={cardIn}>
              <GlassCard variant="solid" pad="lg" animateIn={false}>
                <div className="flex items-center justify-between">
                  <p className="font-bold">Сегодня</p>
                  <span className="text-sm font-semibold text-muted-foreground">
                    {plan.completed} из {plan.total} · {pct}%
                  </span>
                </div>
                <div className="mt-3">
                  <XPProgress value={plan.total ? plan.completed / plan.total : 0} size="md" />
                </div>
              </GlassCard>
            </motion.div>

            <div className="mt-4 space-y-3">
              {plan.tasks.map((task) => (
                <motion.div key={task.id} variants={cardIn}>
                  <TaskRow task={task} onChange={patchTask} />
                </motion.div>
              ))}
              {plan.tasks.length === 0 && (
                <p className="mt-10 text-center text-sm text-muted-foreground">На сегодня задач нет</p>
              )}
            </div>
          </>
        )}
      </motion.main>
    </div>
  );
}

function recompute(p: DailyPlanDTO): DailyPlanDTO {
  return { ...p, completed: p.tasks.filter((t) => t.status === "COMPLETED").length };
}

function TaskRow({ task, onChange }: { task: DailyTaskDTO; onChange: (t: DailyTaskDTO) => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const done = task.status === "COMPLETED";
  const skipped = task.status === "SKIPPED";
  const hasChecklist = task.checklist.length > 0;
  const [open, setOpen] = useState(!done && hasChecklist);
  const [pendingItem, setPendingItem] = useState<string | null>(null);

  const checkDone = task.checklist.filter((c) => c.done).length;

  const complete = async () => {
    setBusy(true);
    try {
      const { task: updated } = await completePlanTask(task.id);
      hapticSuccess();
      onChange(updated);
    } finally {
      setBusy(false);
    }
  };
  const skip = async () => {
    setBusy(true);
    try {
      const { task: updated } = await skipPlanTask(task.id);
      haptic("light");
      onChange(updated);
    } finally {
      setBusy(false);
    }
  };
  const toggle = async (itemId: string, next: boolean) => {
    setPendingItem(itemId);
    hapticSelection();
    try {
      const { task: updated } = await toggleChecklistItem(task.id, itemId, next);
      if (updated.status === "COMPLETED" && !done) hapticSuccess();
      onChange(updated);
    } finally {
      setPendingItem(null);
    }
  };

  return (
    <GlassCard
      variant="solid"
      pad="md"
      animateIn={false}
      className={cn((done || skipped) && "opacity-70", task.priority === "HIGH" && !done && "ring-1 ring-brand/40")}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 shrink-0">
          {done ? (
            <CheckCircle2 className="size-6 text-success" />
          ) : task.mode === "blocked" ? (
            <Lock className="size-5 text-muted-foreground" />
          ) : (
            <Circle className="size-6 text-muted-foreground" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className={cn("font-semibold", (done || skipped) && "text-muted-foreground line-through")}>{task.title}</p>
            {task.priority === "HIGH" && <Badge variant="brand" size="sm">Приоритет</Badge>}
            {task.timeHint && (
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                <Clock className="size-3" /> {task.timeHint}
              </span>
            )}
            {task.required && <Badge variant="neutral" size="sm">обязательно</Badge>}
          </div>
          {task.description && <p className="mt-1 text-sm text-muted-foreground">{task.description}</p>}

          {hasChecklist ? (
            <div className="mt-3">
              <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between rounded-xl bg-muted/60 px-3 py-2 text-sm">
                <span className="font-semibold">Чек-лист · {checkDone}/{task.checklist.length}</span>
                <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")} />
              </button>
              {open && (
                <ul className="mt-2 space-y-1">
                  {task.checklist.map((item) => (
                    <li key={item.id}>
                      <button
                        onClick={() => toggle(item.id, !item.done)}
                        disabled={pendingItem === item.id}
                        className="flex w-full items-start gap-2.5 rounded-xl px-3 py-2 text-left text-[15px] hover:bg-muted disabled:opacity-60"
                      >
                        <span className={cn("mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border", item.done ? "border-success bg-success text-white" : "border-border")}>
                          {item.done && <CheckCircle2 className="size-3.5" />}
                        </span>
                        <span className={cn("min-w-0", item.done && "text-muted-foreground line-through")}>
                          {item.text}
                          {!item.required && <span className="ml-1 text-xs text-muted-foreground">(необяз.)</span>}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            !done && !skipped && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {task.category === "LEARNING" && task.actionSlug && (
                  <Button size="sm" onClick={() => { haptic("medium"); router.push(`/academy/lesson/${task.actionSlug}`); }}>
                    Продолжить обучение <ChevronRight className="size-4" />
                  </Button>
                )}
                {task.mode === "manual" && (
                  <>
                    <Button size="sm" loading={busy} onClick={complete}>Выполнить</Button>
                    <Button size="sm" variant="ghost" onClick={skip}>Пропустить</Button>
                  </>
                )}
                {task.mode === "auto" && !task.actionSlug && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="size-3" /> Завершается автоматически после урока
                  </span>
                )}
                {task.mode === "blocked" && <Badge variant="outline" size="sm">Ожидает данных СПМ</Badge>}
              </div>
            )
          )}
        </div>
      </div>
    </GlassCard>
  );
}
