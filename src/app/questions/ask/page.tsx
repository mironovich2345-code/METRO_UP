"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { CheckCircle2, FileText, Image as ImageIcon, Loader2, Paperclip, RotateCw, X } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { useApp } from "@/providers/app-provider";
import { questionsApi } from "@/lib/api/questions-client";
import { ApiError } from "@/lib/api/client";
import { getOwnerKey } from "@/lib/client/owner";
import { loadStoredContext } from "@/lib/home-context-storage";
import {
  QUESTION_CATEGORY_OPTIONS,
  isSubmitDisabled,
  buildCreateQuestionPayload,
  remainingAttachmentSlots,
  resolveScopeHint,
  resolveSenderContext,
  validateAttachmentFile,
  validateQuestionText,
  type AttachmentDraft,
} from "@/lib/client/ask-question-core";
import type { QuestionCategoryDTO } from "@/lib/api/questions-types";
import { cardIn, staggerStack } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * METRO UP ROUND 1, Milestone 2B — "Задать вопрос". Reachable from Profile
 * by MANAGER/CLUB_MANAGER/CITY_MANAGER alike. No chat, no history, no
 * status UI — a single submission form + a clean success state (section 6).
 *
 * Sender context (section 7) is resolved from Home's own last-confirmed
 * active context (home-context-storage.ts — a display hint, never
 * authority) rather than a role picker on this form; the server
 * independently re-validates it via canSendQuestionAs regardless of what
 * is sent.
 */
function describeQuestionError(code: string | null): string {
  switch (code) {
    case "text_required":
      return "Введите текст вопроса.";
    case "too_many_attachments":
      return "Максимум 5 вложений.";
    case "FILE_TOO_LARGE":
      return "Файл превышает допустимый размер.";
    case "UNSUPPORTED_MIME":
      return "Недопустимый тип файла.";
    case "attachment_not_found":
      return "Не удалось загрузить вложение. Попробуйте снова.";
    case "forbidden":
      return "Недостаточно прав для отправки вопроса. Обновите приложение и попробуйте снова.";
    case "onboarding_required":
      return "Профиль сотрудника не найден.";
    case "upload_failed":
      return "Не удалось загрузить файл. Проверьте соединение.";
    case "ambiguous_scope":
      return "Не удалось определить контекст для вопроса. Выберите город/клуб в приложении и попробуйте снова.";
    case "invalid_scope_hint":
      return "Недействительный контекст. Обновите приложение и попробуйте снова.";
    case "no_scope":
      return "Недостаточно прав для отправки вопроса.";
    default:
      return "Не удалось отправить вопрос. Попробуйте ещё раз.";
  }
}

function attachmentIcon(mimeType: string) {
  return mimeType === "application/pdf" ? FileText : ImageIcon;
}

let draftIdCounter = 0;
function nextLocalId(): string {
  draftIdCounter += 1;
  return `draft-${draftIdCounter}`;
}

export default function AskQuestionPage() {
  const router = useRouter();
  const { hydrated, isOnboarded } = useApp();
  const [category, setCategory] = useState<QuestionCategoryDTO>("WORK_PROCESSES");
  const [text, setText] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [attachments, setAttachments] = useState<AttachmentDraft[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [succeeded, setSucceeded] = useState(false);
  const [textTouched, setTextTouched] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!hydrated || !isOnboarded) {
    return <div className="min-h-[100dvh]" />;
  }

  async function uploadOne(file: File, localId: string) {
    try {
      const ticket = await questionsApi.requestAttachmentUpload({ contentType: file.type, sizeBytes: file.size });
      await questionsApi.uploadAttachmentBlob(ticket, file);
      setAttachments((prev) => prev.map((a) => (a.localId === localId ? { ...a, status: "done", storageKey: ticket.storageKey } : a)));
    } catch (e) {
      const message = e instanceof ApiError ? describeQuestionError(e.code) : "Не удалось загрузить файл.";
      setAttachments((prev) => prev.map((a) => (a.localId === localId ? { ...a, status: "error", errorMessage: message } : a)));
    }
  }

  function onFilesChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;

    const slots = remainingAttachmentSlots(attachments);
    if (slots === 0) {
      setSubmitError("Максимум 5 вложений.");
      return;
    }
    const accepted = files.slice(0, slots);
    if (files.length > accepted.length) {
      setSubmitError("Можно приложить не более 5 файлов.");
    } else {
      setSubmitError(null);
    }

    for (const file of accepted) {
      const check = validateAttachmentFile(file);
      const localId = nextLocalId();
      if (!check.ok) {
        setAttachments((prev) => [...prev, { localId, file, status: "error", storageKey: null, errorMessage: check.message }]);
        continue;
      }
      setAttachments((prev) => [...prev, { localId, file, status: "uploading", storageKey: null, errorMessage: null }]);
      void uploadOne(file, localId);
    }
  }

  function removeAttachment(localId: string) {
    setAttachments((prev) => prev.filter((a) => a.localId !== localId));
  }

  function retryAttachment(localId: string) {
    const draft = attachments.find((a) => a.localId === localId);
    if (!draft) return;
    setAttachments((prev) => prev.map((a) => (a.localId === localId ? { ...a, status: "uploading", errorMessage: null } : a)));
    void uploadOne(draft.file, localId);
  }

  async function submit() {
    const textCheck = validateQuestionText(text);
    if (!textCheck.ok) {
      setTextTouched(true);
      setSubmitError(textCheck.message);
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const stored = loadStoredContext(getOwnerKey());
      const senderContext = resolveSenderContext(stored);
      const scopeHint = resolveScopeHint(stored);
      const payload = buildCreateQuestionPayload({ senderContext, category, text, anonymous, attachments, scopeHint });
      await questionsApi.create(payload);
      setSucceeded(true);
    } catch (e) {
      setSubmitError(e instanceof ApiError ? describeQuestionError(e.code) : describeQuestionError(null));
    } finally {
      setSubmitting(false);
    }
  }

  if (succeeded) {
    return (
      <div className="relative flex min-h-[100dvh] flex-col items-center justify-center gap-5 px-8 pb-[env(safe-area-inset-bottom)] text-center">
        <span className="flex size-16 items-center justify-center rounded-full bg-success/12">
          <CheckCircle2 className="size-8 text-success" />
        </span>
        <div>
          <p className="text-xl font-extrabold tracking-tight">Вопрос отправлен</p>
          <p className="mt-1.5 text-sm text-muted-foreground">Руководитель получил ваше обращение.</p>
        </div>
        <Button block onClick={() => router.push("/profile")} className="mt-2 max-w-xs">
          Готово
        </Button>
      </div>
    );
  }

  const disabled = isSubmitDisabled({ submitting, text, attachments });
  const textCheck = validateQuestionText(text);

  return (
    <div className="relative min-h-[100dvh] pb-[calc(env(safe-area-inset-bottom)+32px)]">
      <AppHeader title="Задать вопрос" showBack backHref="/profile" showThemeSwitcher={false} />

      <motion.main variants={staggerStack} initial="hidden" animate="show" className="flex flex-col gap-5 px-5 pt-2">
        {/* Категория */}
        <motion.div variants={cardIn} className="flex flex-col gap-2">
          <p className="px-1 text-sm font-bold text-foreground">Категория</p>
          <div className="flex flex-wrap gap-2">
            {QUESTION_CATEGORY_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setCategory(opt.value)}
                className={cn(
                  "rounded-full border px-3.5 py-2 text-sm font-medium transition-colors",
                  category === opt.value ? "border-brand bg-brand/10 text-foreground" : "border-border bg-card text-muted-foreground",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </motion.div>

        {/* Ваш вопрос */}
        <motion.div variants={cardIn} className="flex flex-col gap-2">
          <p className="px-1 text-sm font-bold text-foreground">Ваш вопрос</p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={() => setTextTouched(true)}
            rows={6}
            placeholder="Опишите вопрос или обращение…"
            className="w-full resize-none rounded-2xl border border-border bg-card p-4 text-[15px] outline-none focus:border-brand"
          />
          {textTouched && textCheck && !textCheck.ok && <p className="px-1 text-xs text-red-500">{textCheck.message}</p>}
        </motion.div>

        {/* Вложения */}
        <motion.div variants={cardIn} className="flex flex-col gap-2">
          <p className="px-1 text-sm font-bold text-foreground">Вложения</p>
          {attachments.length > 0 && (
            <GlassCard variant="solid" pad="none" animateIn={false} className="divide-y divide-border">
              {attachments.map((a) => {
                const Icon = attachmentIcon(a.file.type);
                return (
                  <div key={a.localId} className="flex items-center gap-3 p-3.5">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted">
                      <Icon className="size-4 text-muted-foreground" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{a.file.name}</p>
                      {a.status === "error" && <p className="truncate text-xs text-red-500">{a.errorMessage}</p>}
                      {a.status === "uploading" && <p className="text-xs text-muted-foreground">Загрузка…</p>}
                      {a.status === "done" && <p className="text-xs text-success">Готово</p>}
                    </div>
                    {a.status === "uploading" && <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />}
                    {a.status === "error" && (
                      <button type="button" onClick={() => retryAttachment(a.localId)} aria-label="Повторить" className="shrink-0 p-1 text-muted-foreground">
                        <RotateCw className="size-4" />
                      </button>
                    )}
                    <button type="button" onClick={() => removeAttachment(a.localId)} aria-label="Удалить" className="shrink-0 p-1 text-muted-foreground">
                      <X className="size-4" />
                    </button>
                  </div>
                );
              })}
            </GlassCard>
          )}
          <Button
            variant="secondary"
            onClick={() => fileInputRef.current?.click()}
            disabled={remainingAttachmentSlots(attachments) === 0}
            className="self-start"
          >
            <Paperclip className="size-4" /> Прикрепить файл
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,application/pdf"
            className="hidden"
            onChange={onFilesChosen}
          />
          <p className="px-1 text-xs text-muted-foreground">JPG, PNG, WEBP, PDF · до 10 МБ · не более 5 файлов</p>
        </motion.div>

        {/* Анонимно */}
        <motion.div variants={cardIn}>
          <GlassCard variant="solid" pad="md" animateIn={false} className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold text-foreground">Анонимно</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Руководители не увидят ваше имя.</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={anonymous}
              onClick={() => setAnonymous((v) => !v)}
              className={cn("relative h-7 w-12 shrink-0 rounded-full transition-colors", anonymous ? "bg-brand" : "bg-muted")}
            >
              <span
                className={cn(
                  "absolute top-0.5 size-6 rounded-full bg-white shadow transition-transform",
                  anonymous ? "translate-x-5" : "translate-x-0.5",
                )}
              />
            </button>
          </GlassCard>
        </motion.div>

        {submitError && (
          <motion.div variants={cardIn}>
            <p className="text-sm text-red-500">{submitError}</p>
          </motion.div>
        )}

        <motion.div variants={cardIn}>
          <Button block loading={submitting} disabled={disabled} onClick={submit}>
            Отправить
          </Button>
        </motion.div>
      </motion.main>
    </div>
  );
}
