"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import { FileText } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useApp } from "@/providers/app-provider";
import { ApiError } from "@/lib/api/client";
import { questionsApi, questionAttachmentDownloadUrl } from "@/lib/api/questions-client";
import { useQuery, QUERY_POLICY, invalidate, invalidatePrefix } from "@/lib/client/query-cache";
import { cacheKeys, cacheKeyPrefixes } from "@/lib/client/cache-keys";
import {
  questionCategoryLabel,
  questionStatusActionLabel,
  questionStatusBadgeVariant,
  questionStatusLabel,
  questionStatusTransitions,
} from "@/lib/client/questions-ui";
import type { QuestionAttachmentDTO, QuestionStatusDTO } from "@/lib/api/questions-types";
import { cardIn, staggerStack } from "@/lib/motion";

/**
 * METRO UP ROUND 1, Milestone 3 — question detail. Role-neutral, same
 * reasoning as the list page. For an anonymous question, `authorDisplay` is
 * already "Анонимный сотрудник" server-side (questions-core.ts's
 * sanitizeQuestionForActor) and `authorUserId` is genuinely absent from the
 * response — this page never renders an avatar, never derives initials
 * from a name, and never reads/shows any id field for the author, anonymous
 * or not (EmployeeQuestionDTO carries no avatar data at all to begin with).
 */
function describeStatusError(code: string | null): string {
  if (code === "forbidden") return "Недостаточно прав для изменения статуса.";
  if (code === "question_not_found") return "Вопрос не найден.";
  return "Не удалось обновить статус.";
}

export default function QuestionDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { hydrated, isOnboarded } = useApp();
  const [statusError, setStatusError] = useState<string | null>(null);
  const [updating, setUpdating] = useState<QuestionStatusDTO | null>(null);

  const { data: question, error, isLoading, mutate } = useQuery(
    cacheKeys.questionDetail(id),
    () => questionsApi.get(id).then((r) => r.question),
    QUERY_POLICY.MUTABLE,
  );

  async function changeStatus(next: QuestionStatusDTO) {
    setUpdating(next);
    setStatusError(null);
    try {
      const { question: updated } = await questionsApi.updateStatus(id, next);
      await invalidate(cacheKeys.questionDetail(id));
      invalidatePrefix(cacheKeyPrefixes.questions);
      invalidatePrefix(cacheKeyPrefixes.home);
      await mutate(updated, { revalidate: false });
    } catch (e) {
      setStatusError(describeStatusError(e instanceof ApiError ? e.code : null));
    } finally {
      setUpdating(null);
    }
  }

  if (!hydrated || !isOnboarded) {
    return <div className="min-h-[100dvh]" />;
  }

  return (
    <div className="relative min-h-[100dvh] pb-[calc(env(safe-area-inset-bottom)+32px)]">
      <AppHeader title="Вопрос" showBack backHref="/questions" showThemeSwitcher={false} />

      <motion.main variants={staggerStack} initial="hidden" animate="show" className="flex flex-col gap-4 px-5 pt-2">
        {isLoading && !question && <div className="h-64 animate-pulse rounded-3xl bg-muted" />}

        {error && (
          <motion.div variants={cardIn}>
            <GlassCard variant="solid" pad="lg" animateIn={false} className="text-center">
              <p className="font-semibold">Не удалось загрузить вопрос.</p>
              <Button className="mt-4" variant="secondary" onClick={() => mutate()}>
                Повторить
              </Button>
            </GlassCard>
          </motion.div>
        )}

        {question && (
          <>
            <motion.div variants={cardIn} className="flex items-center justify-between">
              <Badge variant="outline">{questionCategoryLabel(question.category)}</Badge>
              <Badge variant={questionStatusBadgeVariant(question.status)}>{questionStatusLabel(question.status)}</Badge>
            </motion.div>

            <motion.div variants={cardIn}>
              <GlassCard variant="solid" pad="lg" animateIn={false} className="flex flex-col gap-3">
                <div>
                  <p className="text-[15px] font-semibold text-foreground">{question.authorDisplay}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {question.clubName ? `${question.clubName}, ` : ""}
                    {question.cityName} · {new Date(question.createdAt).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}
                  </p>
                </div>
                <p className="whitespace-pre-wrap text-[15px] text-foreground">{question.text}</p>
              </GlassCard>
            </motion.div>

            {question.attachments.length > 0 && (
              <motion.div variants={cardIn} className="flex flex-col gap-2">
                <p className="px-1 text-sm font-bold text-foreground">Вложения</p>
                <div className="flex flex-col gap-2">
                  {question.attachments.map((a) => (
                    <AttachmentRow key={a.id} attachment={a} />
                  ))}
                </div>
              </motion.div>
            )}

            {statusError && (
              <motion.div variants={cardIn}>
                <p className="px-1 text-sm text-red-500">{statusError}</p>
              </motion.div>
            )}

            <StatusActions question={question} updating={updating} onChange={changeStatus} />
          </>
        )}
      </motion.main>
    </div>
  );
}

/** Image attachments preview inline; PDF gets an explicit open action — the
 * download proxy's own URL (questionAttachmentDownloadUrl) never contains a
 * storage path, just an opaque attachment id. */
function AttachmentRow({ attachment }: { attachment: QuestionAttachmentDTO }) {
  const isImage = attachment.mimeType.startsWith("image/");
  const url = questionAttachmentDownloadUrl(attachment.id);

  if (isImage) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-2xl border border-border bg-card">
        {/* eslint-disable-next-line @next/next/no-img-element -- same-origin, cookie-authed proxy URL; next/image's optimizer cannot sign/forward our auth cookie for this route */}
        <img src={url} alt={attachment.originalName} className="max-h-72 w-full object-cover" />
      </a>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3.5"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted">
        <FileText className="size-4 text-muted-foreground" />
      </span>
      <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{attachment.originalName}</p>
    </a>
  );
}

function StatusActions({
  question,
  updating,
  onChange,
}: {
  question: { status: QuestionStatusDTO };
  updating: QuestionStatusDTO | null;
  onChange: (next: QuestionStatusDTO) => void;
}) {
  const { forward, correction } = questionStatusTransitions(question.status);
  if (!forward && !correction) return null;

  return (
    <motion.div variants={cardIn} className="flex flex-col gap-2">
      {forward && (
        <Button block loading={updating === forward} disabled={updating !== null} onClick={() => onChange(forward)}>
          {questionStatusActionLabel(forward)}
        </Button>
      )}
      {correction && (
        <Button block variant="secondary" loading={updating === correction} disabled={updating !== null} onClick={() => onChange(correction)}>
          {questionStatusActionLabel(correction)}
        </Button>
      )}
    </motion.div>
  );
}
