"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Check, CircleAlert, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { cn } from "@/lib/utils";
import { cardIn, staggerStack } from "@/lib/motion";
import { haptic, hapticSuccess, hapticSelection } from "@/lib/telegram";
import { submitQuizApi } from "@/lib/api/content-client";
import { ApiError } from "@/lib/api/client";
import type { PublicQuizDTO, QuizSubmitResultDTO } from "@/lib/api/content-types";

/**
 * Employee quiz. Answers are graded on the server (no answer keys are present in
 * the DTO). On pass the server completes the lesson and awards XP; this calls
 * `onPassed`. In preview mode submission is disabled.
 */
export function QuizFlow({
  quiz,
  slug,
  preview,
  onPassed,
}: {
  quiz: PublicQuizDTO;
  slug: string;
  preview: boolean;
  onPassed: (r: QuizSubmitResultDTO) => void;
}) {
  const [selected, setSelected] = useState<Record<string, Set<string>>>({});
  const [result, setResult] = useState<QuizSubmitResultDTO | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(quiz.attemptsUsed);

  const toggle = (questionId: string, optionId: string, multiple: boolean) => {
    hapticSelection();
    setSelected((prev) => {
      const current = new Set(prev[questionId] ?? []);
      if (multiple) {
        if (current.has(optionId)) current.delete(optionId);
        else current.add(optionId);
      } else {
        current.clear();
        current.add(optionId);
      }
      return { ...prev, [questionId]: current };
    });
  };

  const allAnswered = quiz.questions.every((q) => (selected[q.id]?.size ?? 0) > 0);
  const noAttemptsLeft = quiz.maxAttempts != null && attempts >= quiz.maxAttempts;

  const submit = async () => {
    if (preview) return;
    setSubmitting(true);
    setError(null);
    try {
      const answers = quiz.questions.map((q) => ({
        questionId: q.id,
        optionIds: [...(selected[q.id] ?? [])],
      }));
      const r = await submitQuizApi(slug, answers);
      setResult(r);
      setAttempts((a) => a + 1);
      if (r.passed) {
        hapticSuccess();
        onPassed(r);
      } else {
        haptic("heavy");
      }
    } catch (e) {
      setError(e instanceof ApiError && e.code === "no_attempts_left" ? "Попытки закончились" : "Не удалось отправить тест");
    } finally {
      setSubmitting(false);
    }
  };

  const retry = () => {
    setResult(null);
    setSelected({});
    setError(null);
  };

  const resultById = new Map(result?.results.map((r) => [r.questionId, r]) ?? []);

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

      {quiz.questions.map((q, qi) => {
        const multiple = q.type === "MULTIPLE_CHOICE";
        const qResult = resultById.get(q.id);
        return (
          <motion.div key={q.id} variants={cardIn}>
            <GlassCard variant="solid" pad="md" animateIn={false}>
              <p className="font-semibold">
                {qi + 1}. {q.text}
              </p>
              {multiple && <p className="mt-0.5 text-xs text-muted-foreground">Можно выбрать несколько</p>}
              <div className="mt-3 space-y-2">
                {q.options.map((o) => {
                  const isSel = selected[q.id]?.has(o.id) ?? false;
                  const isCorrect = qResult?.correctOptionIds.includes(o.id);
                  const showResult = Boolean(qResult);
                  return (
                    <button
                      key={o.id}
                      disabled={showResult || submitting}
                      onClick={() => toggle(q.id, o.id, multiple)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left text-[15px] transition-colors",
                        !showResult && isSel && "border-brand bg-brand/10",
                        !showResult && !isSel && "border-border bg-card",
                        showResult && isCorrect && "border-success bg-success-soft",
                        showResult && !isCorrect && isSel && "border-red-500 bg-red-500/10",
                        showResult && !isCorrect && !isSel && "border-border opacity-70",
                      )}
                    >
                      <span
                        className={cn(
                          "flex size-5 shrink-0 items-center justify-center rounded-full border",
                          isSel ? "border-brand bg-brand text-brand-foreground" : "border-border",
                        )}
                      >
                        {showResult ? (
                          isCorrect ? <Check className="size-3.5" /> : isSel ? <X className="size-3.5" /> : null
                        ) : isSel ? (
                          <Check className="size-3.5" />
                        ) : null}
                      </span>
                      <span>{o.text}</span>
                    </button>
                  );
                })}
              </div>
              {qResult?.explanation && (
                <p className="mt-2 rounded-xl bg-muted px-3 py-2 text-sm text-muted-foreground">{qResult.explanation}</p>
              )}
            </GlassCard>
          </motion.div>
        );
      })}

      {error && (
        <p className="flex items-center gap-2 text-sm text-red-500">
          <CircleAlert className="size-4" /> {error}
        </p>
      )}

      {result && (
        <GlassCard variant={result.passed ? "brand" : "solid"} pad="md" animateIn={false}>
          <p className={cn("font-bold", result.passed && "text-brand-foreground")}>
            {result.passed ? "Тест пройден!" : "Тест не пройден"}
          </p>
          <p className={cn("text-sm", result.passed ? "text-brand-foreground/80" : "text-muted-foreground")}>
            Результат: {result.scorePercent}%{result.passed && result.xpAwarded > 0 && ` · +${result.xpAwarded} XP`}
          </p>
        </GlassCard>
      )}

      {preview ? (
        <p className="text-center text-sm text-muted-foreground">Предпросмотр — тест не отправляется</p>
      ) : !result ? (
        <Button block loading={submitting} disabled={!allAnswered || noAttemptsLeft} onClick={submit}>
          {noAttemptsLeft ? "Попытки закончились" : "Отправить тест"}
        </Button>
      ) : !result.passed && !noAttemptsLeft ? (
        <Button block variant="secondary" onClick={retry}>
          <RotateCcw className="size-4" /> Попробовать снова
        </Button>
      ) : null}
    </motion.section>
  );
}
