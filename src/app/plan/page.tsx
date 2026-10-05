"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, ChevronDown, ChevronRight, Circle, Clock, Lock } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { BottomNavigation, useEffectiveNavContext } from "@/components/bottom-navigation";
import { ManagementAvatarLink } from "@/components/management/management-primitives";
import { GlassCard } from "@/components/ui/glass-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { XPProgress } from "@/components/ui/xp-progress";
import { RevalidatingBar } from "@/components/ui/revalidating-bar";
import { cardIn, staggerStack } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { haptic, hapticSelection, hapticSuccess } from "@/lib/telegram";
import { completePlanTask, fetchPlanToday, skipPlanTask, toggleChecklistItem } from "@/lib/api/home-client";
import { useQuery, QUERY_POLICY, invalidatePrefix } from "@/lib/client/query-cache";
import { cacheKeys, cacheKeyPrefixes } from "@/lib/client/cache-keys";
import type { DailyPlanDTO, DailyTaskDTO } from "@/lib/api/home-types";

export default function PlanScreen() {
  // Round A.1, section A — /plan is ALSO a plain PERSONAL employee's own
  // screen (Home's "Открыть план" card); the avatar entry + dropped back
  // button only apply when the viewer's effective context is actually
  // CLUB_MANAGER (/plan is not in CITY_MANAGER's own nav set at all) —
  // PERSONAL's header stays byte-identical either way.
  const effectiveContext = useEffectiveNavContext();
  const isClubManagerRoot = effectiveContext === "CLUB_MANAGER";

  const { data: plan, error, isLoading, isValidating, mutate } = useQuery(
    cacheKeys.planToday(),
    fetchPlanToday,
    QUERY_POLICY.MUTABLE,
  );
  const status: "loading" | "ready" | "error" = error ? "error" : !plan && isLoading ? "loading" : plan ? "ready" : "loading";

  // Optimistic local patch (unchanged behavior — no round trip needed to
  // reflect a change this screen itself just made), now written THROUGH the
  // SWR cache (revalidate:false) so a later re-mount of /plan or Home's Plan
  // card never reads the stale pre-mutation snapshot before the next real
  // revalidation. Section 7: Home's own Plan summary is also invalidated —
  // completing/skipping/toggling a checklist item (which can silently
  // auto-complete a task) all change what Home's card would show.
  const patchTask = (task: DailyTaskDTO) => {
    mutate((p) => (p ? recompute({ ...p, tasks: p.tasks.map((t) => (t.id === task.id ? task : t)) }) : p), { revalidate: false });
    invalidatePrefix(cacheKeyPrefixes.home);
  };

  const dateLabel = plan
    ? new Date(plan.date).toLocaleDateString("ru-RU", { day: "numeric", month: "long", weekday: "long" })
    : "";
  const pct = plan && plan.total ? Math.round((plan.completed / plan.total) * 100) : 0;

  return (
    <div className="relative min-h-[100dvh] pb-32">
      <AppHeader
        title="План на сегодня"
        subtitle={dateLabel}
        showBack={!isClubManagerRoot}
        backHref={!isClubManagerRoot ? "/home" : undefined}
        leading={isClubManagerRoot ? <ManagementAvatarLink /> : undefined}
        showThemeSwitcher={false}
      />
      <RevalidatingBar show={Boolean(plan) && isValidating} />

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
            <Button className="mt-4" variant="secondary" onClick={() => mutate()}>Повторить</Button>
          </div>
        )}

        {status === "ready" && plan && (
          <>
            {/* Round B.1, section 4 — zero tasks is a deliberate empty
                state, never "0 из 0 · 0%" + an empty progress bar (which
                reads as broken, not "nothing to do"). Non-zero behavior is
                completely unchanged below. */}
            <motion.div variants={cardIn}>
              <GlassCard variant="solid" pad="lg" animateIn={false}>
                {plan.total === 0 ? (
                  <>
                    <p className="font-bold">Сегодня</p>
                    <p className="mt-2 text-sm text-muted-foreground">На сегодня задач нет</p>
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-between">
                      <p className="font-bold">Сегодня</p>
                      <span className="text-sm font-semibold text-muted-foreground">
                        {plan.completed} из {plan.total} · {pct}%
                      </span>
                    </div>
                    <div className="mt-3">
                      <XPProgress value={plan.completed / plan.total} size="md" />
                    </div>
                  </>
                )}
              </GlassCard>
            </motion.div>

            {plan.tasks.length > 0 && (
              <div className="mt-4 space-y-3">
                {plan.tasks.map((task) => (
                  <motion.div key={task.id} variants={cardIn}>
                    <TaskRow task={task} onChange={patchTask} />
                  </motion.div>
                ))}
              </div>
            )}
          </>
        )}
      </motion.main>

      {/* Management UX Round A, section 6 — /plan is a CLUB_MANAGER root
          workspace screen. /plan is ALSO reached by a plain PERSONAL
          employee (Home's own "Открыть план" card) — BottomNavigation
          resolves ITS OWN effective context per viewer, so a PERSONAL
          visitor correctly still gets the unchanged 5-item PERSONAL bar
          (section 3 — personal mode stays byte-identical), not a
          CLUB_MANAGER set. */}
      <BottomNavigation />
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
