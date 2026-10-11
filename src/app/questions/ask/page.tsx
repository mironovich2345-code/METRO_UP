"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { CheckCircle2, FileText, Image as ImageIcon, Loader2, Paperclip, RotateCw, X } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/option-sheet";
import { Switch } from "@/components/ui/switch";
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
  resolveQuestionScopeSelection,
  resolveScopeHint,
  resolveSenderContext,
  validateAttachmentFile,
  validateQuestionText,
  type AttachmentDraft,
} from "@/lib/client/ask-question-core";
import type { QuestionCategoryDTO } from "@/lib/api/questions-types";
import { cardIn, staggerStack } from "@/lib/motion";
import { useQuery, QUERY_POLICY } from "@/lib/client/query-cache";
import { cacheKeys } from "@/lib/client/cache-keys";

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
    // QA-04.2 — the form now shows the club/city selector BEFORE submit
    // whenever a pick is needed, so these are fallbacks, never the normal path.
    case "ambiguous_scope":
      return "Выберите клуб или город в форме вопроса.";
    case "invalid_scope_hint":
      return "Выбранный клуб или город вам недоступен. Выберите из списка.";
    case "no_scope":
      return "Для вашей роли не найден ни один клуб или город. Обратитесь к администратору.";
    case "VIEW_AS_READ_ONLY":
      return "Отправка вопросов недоступна в режиме просмотра.";
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
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [attachments, setAttachments] = useState<AttachmentDraft[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [succeeded, setSucceeded] = useState(false);
  const [textTouched, setTextTouched] = useState(false);
  // QA-04.2 — the explicit club/city pick, only ever asked for when the
  // server says the sender's scope is genuinely ambiguous.
  const [pickedScopeId, setPickedScopeId] = useState<string | null>(null);
  const [scopeOpen, setScopeOpen] = useState(false);

  // Home's active cabinet decides WHICH role the user is asking as (a
  // selector the server re-validates); the club/city options themselves come
  // from the server's view of the REAL actor's grants, never from storage.
  const stored = hydrated && isOnboarded ? loadStoredContext(getOwnerKey()) : null;
  const senderContext = resolveSenderContext(stored);
  const {
    data: questionContext,
    error: questionContextError,
    mutate: reloadQuestionContext,
  } = useQuery(
    hydrated && isOnboarded ? cacheKeys.questionContext(senderContext) : null,
    () => questionsApi.context(senderContext),
    QUERY_POLICY.MUTABLE,
  );
  const scopeSelection = resolveQuestionScopeSelection({
    context: questionContext,
    storedHint: resolveScopeHint(stored),
    picked: pickedScopeId,
  });
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
      // QA-04.2 — a club/city is sent ONLY when the server asked for a pick;
      // otherwise the server resolves the single real scope itself (a stale
      // stored club can no longer turn a valid submit into an error).
      const payload = buildCreateQuestionPayload({ senderContext, category, text, anonymous, attachments, scopeHint: scopeSelection.scopeHint });
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

  const readOnly = questionContext?.previewReadOnly ?? false;
  // A denied context (role no longer held, no club/city in scope) would only
  // fail on submit too — say so now and keep the button disabled.
  const contextDenied = questionContextError instanceof ApiError && (questionContextError.status === 403 || questionContextError.status === 409);
  const disabled = isSubmitDisabled({ submitting, text, attachments, scopeMissing: scopeSelection.missingSelection, readOnly: readOnly || contextDenied });
  const textCheck = validateQuestionText(text);

  return (
    <div className="relative min-h-[100dvh] pb-[calc(env(safe-area-inset-bottom)+32px)]">
      <AppHeader title="Задать вопрос" showBack backHref="/profile" showThemeSwitcher={false} />

      <motion.main variants={staggerStack} initial="hidden" animate="show" className="flex flex-col gap-5 px-5 pt-2">
        {/* Категория — QA-04: one compact field + bottom sheet instead of a
            wall of chips. Same QUESTION_CATEGORY_OPTIONS, same stored values;
            picking one only sets `category` (text, attachments and the
            anonymous toggle are separate state and stay as they are). */}
        {/* QA-04.2 — only when the sender's scope is genuinely ambiguous
            (several managed clubs / several cities): the actor's OWN options
            from the server. Picking changes only this value — category,
            text, attachments and the anonymous toggle are separate state. */}
        {questionContext?.requiresSelection && questionContext.kind && (
          <motion.div variants={cardIn} className="flex flex-col gap-2">
            <p className="px-1 text-sm font-bold text-foreground">{questionContext.kind === "club" ? "Клуб" : "Город"}</p>
            <SelectField
              label={questionContext.kind === "club" ? "Клуб" : "Город"}
              value={scopeSelection.selectedId}
              placeholder={questionContext.kind === "club" ? "Выберите клуб" : "Выберите город"}
              options={questionContext.options.map((o) => ({ value: o.id, label: o.label }))}
              open={scopeOpen}
              onOpenChange={setScopeOpen}
              onChange={setPickedScopeId}
            />
          </motion.div>
        )}

        {readOnly && (
          <motion.div variants={cardIn}>
            <p className="px-1 text-sm text-muted-foreground">Отправка вопросов недоступна в режиме просмотра.</p>
          </motion.div>
        )}

        {questionContextError && (
          <motion.div variants={cardIn} className="flex items-center gap-3 px-1">
            <p className="min-w-0 flex-1 text-sm text-red-500">
              {contextDenied ? describeQuestionError(questionContextError instanceof ApiError ? questionContextError.code : null) : "Не удалось загрузить данные формы."}
            </p>
            {!contextDenied && (
              <Button size="sm" variant="secondary" onClick={() => void reloadQuestionContext()}>
                Повторить
              </Button>
            )}
          </motion.div>
        )}

        <motion.div variants={cardIn} className="flex flex-col gap-2">
          <p className="px-1 text-sm font-bold text-foreground">Категория</p>
          <SelectField
            label="Категория"
            value={category}
            options={QUESTION_CATEGORY_OPTIONS}
            open={categoryOpen}
            onOpenChange={setCategoryOpen}
            onChange={setCategory}
          />
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
            {/* QA-04 — shared Switch (derived geometry; see switch-geometry.ts
                for the iPhone overflow root cause). OFF = identified, ON =
                anonymous — unchanged. */}
            <Switch checked={anonymous} onCheckedChange={setAnonymous} aria-label="Анонимно" />
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
