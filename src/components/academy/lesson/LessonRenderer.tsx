"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowRight, Clock, Lock, Sparkles, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GlassCard } from "@/components/ui/glass-card";
import { MetricCharacter } from "@/components/ui/metric-character";
import { cardIn, staggerStack } from "@/lib/motion";
import { hapticSuccess } from "@/lib/telegram";
import { completeLessonApi, startLessonApi } from "@/lib/api/content-client";
import type { LessonDetailDTO, QuizSubmitResultDTO } from "@/lib/api/content-types";
import { LessonBlockRenderer } from "./LessonBlockRenderer";
import { QuizFlow } from "./QuizFlow";

/**
 * Shared lesson renderer for the employee player AND the CMS preview. In preview
 * mode completion/XP/progress are disabled (no writes). Opening a page never
 * completes a lesson — completion requires the explicit CTA or a passed quiz.
 */
export function LessonRenderer({ lesson }: { lesson: LessonDetailDTO }) {
  const router = useRouter();
  const preview = lesson.preview;
  const [completed, setCompleted] = useState(lesson.progress.status === "COMPLETED");
  const [xpAwarded, setXpAwarded] = useState(0);
  const [next, setNext] = useState(lesson.next);
  const [completing, setCompleting] = useState(false);
  const started = useRef(false);

  // Mark IN_PROGRESS on first open (never in preview, never when locked/complete).
  useEffect(() => {
    if (preview || started.current) return;
    started.current = true;
    if (!lesson.access.locked && lesson.progress.status === "NOT_STARTED") {
      void startLessonApi(lesson.slug).catch(() => {});
    }
  }, [preview, lesson.slug, lesson.access.locked, lesson.progress.status]);

  const onCtaComplete = async () => {
    if (preview) return;
    setCompleting(true);
    try {
      const r = await completeLessonApi(lesson.slug);
      setXpAwarded(r.xpAwarded);
      setNext(r.next);
      setCompleted(true);
      hapticSuccess();
    } finally {
      setCompleting(false);
    }
  };

  const onQuizPassed = (r: QuizSubmitResultDTO) => {
    setXpAwarded(r.xpAwarded);
    setCompleted(true);
  };

  if (lesson.access.locked && !preview) {
    return (
      <GlassCard variant="solid" pad="lg" className="mt-4 text-center">
        <span className="mx-auto mb-3 flex size-12 items-center justify-center rounded-2xl bg-muted">
          <Lock className="size-5 text-muted-foreground" />
        </span>
        <p className="font-semibold">Урок заблокирован</p>
        <p className="mt-1 text-sm text-muted-foreground">{lesson.access.reason ?? "Завершите предыдущий урок"}</p>
        <Button className="mt-4" variant="secondary" block onClick={() => router.push("/academy")}>
          Назад в Академию
        </Button>
      </GlassCard>
    );
  }

  return (
    <motion.div variants={staggerStack} initial="hidden" animate="show" className="space-y-5">
      <motion.div variants={cardIn}>
        <GlassCard variant="solid" pad="lg" animateIn={false}>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="neutral" size="sm">
              <Clock className="size-3" /> {lesson.durationMinutes} мин
            </Badge>
            {lesson.xpReward > 0 && (
              <Badge variant="brand" size="sm">
                <Star className="size-3" /> +{lesson.xpReward} XP
              </Badge>
            )}
            {lesson.isRequired && <Badge variant="outline" size="sm">Обязательный</Badge>}
          </div>
          <h1 className="mt-3 text-xl font-bold">{lesson.title}</h1>
          {lesson.shortDescription && (
            <p className="mt-1 text-[15px] text-muted-foreground">{lesson.shortDescription}</p>
          )}
        </GlassCard>
      </motion.div>

      {lesson.blocks.map((block) => (
        <motion.div key={block.id} variants={cardIn}>
          <LessonBlockRenderer block={block} />
        </motion.div>
      ))}

      {/* Footer: quiz (own start/result/retry flow), completion state, or CTA.
          A lesson with a quiz keeps the quiz available even once completed so it
          can be retaken (XP stays idempotent server-side). */}
      {lesson.quiz ? (
        <motion.div variants={cardIn}>
          <QuizFlow
            quiz={lesson.quiz}
            slug={lesson.slug}
            preview={preview}
            lessonCompleted={completed}
            next={next}
            onPassed={onQuizPassed}
          />
        </motion.div>
      ) : completed ? (
        <motion.div variants={cardIn}>
          <GlassCard variant="brand" pad="lg" animateIn={false} className="text-center">
            <div className="mx-auto mb-2 w-fit">
              <MetricCharacter size={84} mood="cheer" />
            </div>
            <p className="text-lg font-bold text-brand-foreground">Первый шаг сделан!</p>
            <p className="mt-1 text-sm text-brand-foreground/80">
              Урок завершён{xpAwarded > 0 && ` · +${xpAwarded} XP`}
            </p>
            {next ? (
              <Button className="mt-4" block onClick={() => router.push(`/academy/lesson/${next.slug}`)}>
                Следующий урок <ArrowRight className="size-4" />
              </Button>
            ) : (
              <Button className="mt-4" variant="secondary" block onClick={() => router.push("/academy")}>
                Вернуться в Академию
              </Button>
            )}
          </GlassCard>
        </motion.div>
      ) : (
        <motion.div variants={cardIn}>
          {preview ? (
            <p className="text-center text-sm text-muted-foreground">
              <Sparkles className="mr-1 inline size-4" /> Предпросмотр — завершение и XP отключены
            </p>
          ) : (
            <Button block loading={completing} onClick={onCtaComplete}>
              Завершить урок
            </Button>
          )}
        </motion.div>
      )}
    </motion.div>
  );
}
