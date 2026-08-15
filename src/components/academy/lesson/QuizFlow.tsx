"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowRight, Check, CheckCircle2, CircleAlert, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { cn } from "@/lib/utils";
import { cardIn, staggerStack } from "@/lib/motion";
import { haptic, hapticSuccess, hapticSelection } from "@/lib/telegram";
import { submitQuizApi } from "@/lib/api/content-client";
import { ApiError } from "@/lib/api/client";
import type { PublicQuizDTO, QuizSubmitResultDTO } from "@/lib/api/content-types";
import { scoreCounts, canRetry as canRetryFn, startLabel } from "@/lib/quiz-format";

type Phase = "idle" | "active" | "result";

/**
 * Employee quiz. Grading is entirely server-side (the DTO has no answer keys).
 * States: idle (start / last-result summary) → active (answer) → result (clean
 * Result Card + expandable review + retry). On pass the server completes the
 * lesson and awards XP idempotently; this calls `onPassed`. Preview never submits.
 */
export function QuizFlow({
  quiz,
  slug,
  preview,
  lessonCompleted,
  next,
  onPassed,
}: {
  quiz: PublicQuizDTO;
  slug: string;
  preview: boolean;
  lessonCompleted: boolean;
  next: { slug: string; title: string } | null;
  onPassed: (r: QuizSubmitResultDTO) => void;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>(preview ? "active" : "idle");
  const [selected, setSelected] = useState<Record<string, Set<string>>>({});
  const [result, setResult] = useState<QuizSubmitResultDTO | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(quiz.attemptsUsed);
  const [showReview, setShowReview] = useState(false);

  const retryAllowed = canRetryFn(quiz.maxAttempts, attempts);
  const passed = result?.passed ?? quiz.lastAttempt?.passed ?? false;

  const begin = () => {
    setSelected({});
    setResult(null);
    setShowReview(false);
    setError(null);
    setPhase("active");
  };

  const toggle = (questionId: string, optionId: string, multiple: boolean) => {
    hapticSelection();
    setSelected((prev) => {
      const current = new Set(prev[questionId] ?? []);
      if (multiple) {
        if (current.has(optionId)) current.delete(optionId); else current.add(optionId);
      } else {
        current.clear();
        current.add(optionId);
      }
      return { ...prev, [questionId]: current };
    });
  };

  const allAnswered = quiz.questions.every((q) => (selected[q.id]?.size ?? 0) > 0);

  const submit = async () => {
    if (preview) return;
    setSubmitting(true);
    setError(null);
    try {
      const answers = quiz.questions.map((q) => ({ questionId: q.id, optionIds: [...(selected[q.id] ?? [])] }));
      const r = await submitQuizApi(slug, answers);
      setResult(r);
      setAttempts((a) => a + 1);
      setPhase("result");
      setShowReview(false);
      if (r.passed) { hapticSuccess(); onPassed(r); } else { haptic("heavy"); }
    } catch (e) {
      setError(e instanceof ApiError && e.code === "no_attempts_left" ? "Попытки закончились" : "Не удалось отправить тест");
    } finally {
      setSubmitting(false);
    }
  };

  const goNext = () => (next ? router.push(`/academy/lesson/${next.slug}`) : router.push("/academy"));

  /* -------------------------------- idle --------------------------------- */
  if (phase === "idle") {
    const last = quiz.lastAttempt;
    return (
      <motion.section variants={staggerStack} initial="hidden" animate="show" className="space-y-4">
        <motion.div variants={cardIn}>
          <GlassCard variant="solid" pad="md" animateIn={false}>
            <p className="font-bold">{quiz.title}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Проходной балл: {quiz.passingPercent}%
              {quiz.maxAttempts != null && ` · Попыток: ${attempts}/${quiz.maxAttempts}`}
            </p>
            {last && (
              <div className="mt-3 flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3">
                <span className="text-2xl font-extrabold tabular-nums">{last.scorePercent}%</span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">Последний результат</p>
                  <p className={cn("text-sm font-semibold", last.passed ? "text-success" : "text-foreground")}>
                    {last.passed ? "Тест пройден" : "Тест не пройден"}
                  </p>
                </div>
              </div>
            )}
          </GlassCard>
        </motion.div>

        {retryAllowed ? (
          <Button block onClick={begin}>{startLabel(attempts)}</Button>
        ) : (
          <p className="text-center text-sm text-muted-foreground">Использованы все {quiz.maxAttempts} попытки</p>
        )}
        {lessonCompleted && passed && (
          <Button block variant="secondary" onClick={goNext}>
            {next ? "Следующий урок" : "Вернуться в Академию"} <ArrowRight className="size-4" />
          </Button>
        )}
      </motion.section>
    );
  }

  /* --------------------------- active (answering) ------------------------- */
  if (phase === "active") {
    return (
      <motion.section variants={staggerStack} initial="hidden" animate="show" className="space-y-4">
        <motion.div variants={cardIn}>
          <GlassCard variant="solid" pad="md" animateIn={false}>
            <p className="font-bold">{quiz.title}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Проходной балл: {quiz.passingPercent}%
              {quiz.maxAttempts != null && ` · Попыток: ${attempts}/${quiz.maxAttempts}`}
            </p>
          </GlassCard>
        </motion.div>

        {quiz.questions.map((q, qi) => (
          <motion.div key={q.id} variants={cardIn}>
            <GlassCard variant="solid" pad="md" animateIn={false}>
              <p className="font-semibold">{qi + 1}. {q.text}</p>
              {q.type === "MULTIPLE_CHOICE" && <p className="mt-0.5 text-xs text-muted-foreground">Можно выбрать несколько</p>}
              <div className="mt-3 space-y-2">
                {q.options.map((o) => {
                  const isSel = selected[q.id]?.has(o.id) ?? false;
                  return (
                    <button
                      key={o.id}
                      disabled={submitting}
                      onClick={() => toggle(q.id, o.id, q.type === "MULTIPLE_CHOICE")}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left text-[15px] transition-colors",
                        isSel ? "border-brand bg-brand/10" : "border-border bg-card",
                      )}
                    >
                      <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full border", isSel ? "border-brand bg-brand text-brand-foreground" : "border-border")}>
                        {isSel && <Check className="size-3.5" />}
                      </span>
                      <span>{o.text}</span>
                    </button>
                  );
                })}
              </div>
            </GlassCard>
          </motion.div>
        ))}

        {error && <p className="flex items-center gap-2 text-sm text-red-500"><CircleAlert className="size-4" /> {error}</p>}

        {preview ? (
          <p className="text-center text-sm text-muted-foreground">Предпросмотр — тест не отправляется</p>
        ) : (
          <Button block loading={submitting} disabled={!allAnswered} onClick={submit}>Отправить тест</Button>
        )}
      </motion.section>
    );
  }

  /* ------------------------------- result -------------------------------- */
  const r = result!;
  const { correctCount, total } = scoreCounts(r.results);
  return (
    <motion.section variants={staggerStack} initial="hidden" animate="show" className="space-y-4">
      <motion.div variants={cardIn}>
        <GlassCard variant={r.passed ? "brand" : "solid"} pad="lg" animateIn={false} className="text-center">
          <p className={cn("text-sm font-medium", r.passed ? "text-brand-foreground/80" : "text-muted-foreground")}>Тест завершён</p>
          <p className={cn("mt-1 text-5xl font-extrabold tabular-nums", r.passed ? "text-brand-foreground" : "text-foreground")}>{r.scorePercent}%</p>
          <p className={cn("mt-1 text-sm", r.passed ? "text-brand-foreground/80" : "text-muted-foreground")}>{correctCount} из {total} правильных</p>

          {r.passed ? (
            <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-brand-foreground/15 px-3 py-1 text-sm font-semibold text-brand-foreground">
              <CheckCircle2 className="size-4" /> Тест пройден{r.xpAwarded > 0 && ` · +${r.xpAwarded} XP`}
            </p>
          ) : (
            <p className="mt-3 inline-flex items-center gap-1.5 rounded-2xl bg-muted px-3 py-1.5 text-sm font-medium text-muted-foreground">
              Нужно набрать минимум {quiz.passingPercent}%
            </p>
          )}
        </GlassCard>
      </motion.div>

      <motion.div variants={cardIn} className="space-y-2">
        <Button block variant="secondary" onClick={() => setShowReview((s) => !s)}>
          {showReview ? "Скрыть результаты" : "Посмотреть результаты"}
        </Button>
        {retryAllowed && (
          <Button block variant={r.passed ? "secondary" : "primary"} onClick={begin}>
            <RotateCcw className="size-4" /> Пройти тест ещё раз
          </Button>
        )}
        {!retryAllowed && <p className="text-center text-sm text-muted-foreground">Использованы все {quiz.maxAttempts} попытки</p>}
        {r.passed && (
          <Button block variant={retryAllowed ? "ghost" : "primary"} onClick={goNext}>
            {next ? "Следующий урок" : "Вернуться в Академию"} <ArrowRight className="size-4" />
          </Button>
        )}
      </motion.div>

      {showReview && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="space-y-3">
          {quiz.questions.map((q, qi) => {
            const qr = r.results.find((x) => x.questionId === q.id);
            const mine = [...(selected[q.id] ?? [])].map((id) => q.options.find((o) => o.id === id)?.text).filter(Boolean) as string[];
            const correctTexts = (qr?.correctOptionIds ?? []).map((id) => q.options.find((o) => o.id === id)?.text).filter(Boolean) as string[];
            const ok = qr?.correct ?? false;
            return (
              <GlassCard key={q.id} variant="solid" pad="md" animateIn={false} className={cn("border", ok ? "border-success/40" : "border-amber-500/40")}>
                <p className="font-semibold">{qi + 1}. {q.text}</p>
                <p className="mt-2 text-xs font-medium text-muted-foreground">Ваш ответ:</p>
                <p className="text-sm">{mine.length ? mine.join(", ") : "—"}</p>
                {ok ? (
                  <p className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-success"><Check className="size-4" /> Правильно</p>
                ) : (
                  <>
                    <p className="mt-2 text-xs font-medium text-muted-foreground">Правильный ответ:</p>
                    <p className="text-sm text-foreground">{correctTexts.join(", ")}</p>
                    <p className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-amber-600 dark:text-amber-500"><X className="size-4" /> Ошибка</p>
                  </>
                )}
                {qr?.explanation && <p className="mt-2 rounded-xl bg-muted px-3 py-2 text-sm text-muted-foreground">{qr.explanation}</p>}
              </GlassCard>
            );
          })}
        </motion.div>
      )}
    </motion.section>
  );
}
