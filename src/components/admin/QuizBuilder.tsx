"use client";

import { useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import { adminApi, type AdminQuiz } from "@/lib/api/content-client";
import { ApiError } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { Field, TextArea, TextInput, fieldCls } from "./ui";

type QType = "SINGLE_CHOICE" | "MULTIPLE_CHOICE" | "TRUE_FALSE";
interface Opt { text: string; isCorrect: boolean }
interface Question { text: string; type: QType; explanation: string; options: Opt[] }

function fromInitial(q: AdminQuiz | null): {
  title: string; passingPercent: number; xpReward: number; maxAttempts: string; questions: Question[];
} {
  if (!q) {
    return {
      title: "Проверка знаний", passingPercent: 70, xpReward: 0, maxAttempts: "",
      questions: [{ text: "", type: "SINGLE_CHOICE", explanation: "", options: [{ text: "", isCorrect: true }, { text: "", isCorrect: false }] }],
    };
  }
  return {
    title: q.title, passingPercent: q.passingPercent, xpReward: q.xpReward,
    maxAttempts: q.maxAttempts?.toString() ?? "",
    questions: q.questions.map((qq) => ({
      text: qq.text, type: qq.type as QType, explanation: qq.explanation ?? "",
      options: qq.options.map((o) => ({ text: o.text, isCorrect: o.isCorrect })),
    })),
  };
}

export function QuizBuilder({
  lessonId,
  initial,
  disabled,
  onSaved,
}: {
  lessonId: string;
  initial: AdminQuiz | null;
  disabled: boolean;
  onSaved: () => Promise<void>;
}) {
  const [q, setQ] = useState(() => fromInitial(initial));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasQuiz, setHasQuiz] = useState(Boolean(initial));

  const setQuestion = (i: number, patch: Partial<Question>) =>
    setQ((s) => ({ ...s, questions: s.questions.map((qq, idx) => (idx === i ? { ...qq, ...patch } : qq)) }));

  const setOption = (qi: number, oi: number, patch: Partial<Opt>) =>
    setQuestion(qi, {
      options: q.questions[qi].options.map((o, idx) => (idx === oi ? { ...o, ...patch } : o)),
    });

  const changeType = (qi: number, type: QType) => {
    if (type === "TRUE_FALSE") {
      setQuestion(qi, { type, options: [{ text: "Верно", isCorrect: true }, { text: "Неверно", isCorrect: false }] });
    } else {
      setQuestion(qi, { type });
    }
  };

  const markCorrect = (qi: number, oi: number) => {
    const question = q.questions[qi];
    if (question.type === "MULTIPLE_CHOICE") {
      setOption(qi, oi, { isCorrect: !question.options[oi].isCorrect });
    } else {
      setQuestion(qi, { options: question.options.map((o, idx) => ({ ...o, isCorrect: idx === oi })) });
    }
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const body = {
        title: q.title,
        passingPercent: q.passingPercent,
        xpReward: q.xpReward,
        maxAttempts: q.maxAttempts ? Number(q.maxAttempts) : null,
        questions: q.questions.map((qq) => ({
          text: qq.text,
          type: qq.type,
          explanation: qq.explanation || null,
          options: qq.options,
        })),
      };
      await adminApi.upsertQuiz(lessonId, body);
      setHasQuiz(true);
      await onSaved();
    } catch (e) {
      setError(e instanceof ApiError ? `Ошибка: ${e.code}` : "Не удалось сохранить тест");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!confirm("Удалить тест?")) return;
    await adminApi.deleteQuiz(lessonId);
    setHasQuiz(false);
    setQ(fromInitial(null));
    await onSaved();
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Название теста"><TextInput value={q.title} onChange={(e) => setQ({ ...q, title: e.target.value })} /></Field>
        <Field label="Проходной %"><TextInput type="number" value={q.passingPercent} onChange={(e) => setQ({ ...q, passingPercent: Number(e.target.value) })} /></Field>
        <Field label="XP за тест"><TextInput type="number" value={q.xpReward} onChange={(e) => setQ({ ...q, xpReward: Number(e.target.value) })} /></Field>
        <Field label="Макс. попыток" hint="пусто = ∞"><TextInput type="number" value={q.maxAttempts} onChange={(e) => setQ({ ...q, maxAttempts: e.target.value })} /></Field>
      </div>

      {q.questions.map((question, qi) => (
        <div key={qi} className="rounded-2xl border border-border bg-background p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold">Вопрос {qi + 1}</span>
            <div className="flex items-center gap-2">
              <select className={fieldCls + " w-auto"} value={question.type} onChange={(e) => changeType(qi, e.target.value as QType)}>
                <option value="SINGLE_CHOICE">Один ответ</option>
                <option value="MULTIPLE_CHOICE">Несколько</option>
                <option value="TRUE_FALSE">Верно/Неверно</option>
              </select>
              {q.questions.length > 1 && (
                <button onClick={() => setQ({ ...q, questions: q.questions.filter((_, i) => i !== qi) })} className="rounded-lg p-1.5 text-red-500 hover:bg-red-500/10"><Trash2 className="size-4" /></button>
              )}
            </div>
          </div>
          <div className="mt-3 space-y-3">
            <TextInput placeholder="Текст вопроса" value={question.text} onChange={(e) => setQuestion(qi, { text: e.target.value })} />
            <div className="space-y-2">
              {question.options.map((o, oi) => (
                <div key={oi} className="flex items-center gap-2">
                  <button
                    onClick={() => markCorrect(qi, oi)}
                    title="Отметить правильным"
                    className={cn(
                      "flex size-6 shrink-0 items-center justify-center border text-xs",
                      question.type === "MULTIPLE_CHOICE" ? "rounded-md" : "rounded-full",
                      o.isCorrect ? "border-success bg-success text-white" : "border-border",
                    )}
                  >
                    {o.isCorrect ? "✓" : ""}
                  </button>
                  <TextInput
                    placeholder={`Вариант ${oi + 1}`}
                    value={o.text}
                    disabled={question.type === "TRUE_FALSE"}
                    onChange={(e) => setOption(qi, oi, { text: e.target.value })}
                  />
                  {question.type !== "TRUE_FALSE" && question.options.length > 2 && (
                    <button onClick={() => setQuestion(qi, { options: question.options.filter((_, i) => i !== oi) })} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"><Trash2 className="size-4" /></button>
                  )}
                </div>
              ))}
              {question.type !== "TRUE_FALSE" && (
                <button onClick={() => setQuestion(qi, { options: [...question.options, { text: "", isCorrect: false }] })} className="flex items-center gap-1 text-sm text-brand">
                  <Plus className="size-4" /> Добавить вариант
                </button>
              )}
            </div>
            <Field label="Пояснение (показывается после ответа)">
              <TextArea value={question.explanation} onChange={(e) => setQuestion(qi, { explanation: e.target.value })} rows={2} />
            </Field>
          </div>
        </div>
      ))}

      <button
        onClick={() => setQ({ ...q, questions: [...q.questions, { text: "", type: "SINGLE_CHOICE", explanation: "", options: [{ text: "", isCorrect: true }, { text: "", isCorrect: false }] }] })}
        className="flex items-center gap-1 rounded-2xl border border-border px-4 py-2 text-sm hover:bg-muted"
      >
        <Plus className="size-4" /> Добавить вопрос
      </button>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="flex items-center gap-3">
        <button onClick={save} disabled={saving || disabled} className="flex items-center gap-1.5 rounded-2xl bg-brand px-5 py-2.5 text-sm font-semibold text-brand-foreground disabled:opacity-50">
          <Save className="size-4" /> {saving ? "Сохранение…" : "Сохранить тест"}
        </button>
        {hasQuiz && (
          <button onClick={remove} disabled={disabled} className="flex items-center gap-1.5 rounded-2xl px-4 py-2.5 text-sm text-red-500 hover:bg-red-500/10">
            <Trash2 className="size-4" /> Удалить тест
          </button>
        )}
      </div>
    </div>
  );
}
