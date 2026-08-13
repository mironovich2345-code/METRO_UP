"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Eye, Plus, Rocket } from "lucide-react";
import { adminApi, type AdminLessonDetail } from "@/lib/api/content-client";
import { ApiError } from "@/lib/api/client";
import { Field, TextArea, TextInput, StatusBadge, fieldCls } from "@/components/admin/ui";
import { BlockEditor } from "@/components/admin/BlockEditor";
import { QuizBuilder } from "@/components/admin/QuizBuilder";

const BLOCK_DEFAULTS: Record<string, unknown> = {
  VIDEO: {},
  COLLAPSIBLE_TEXT: { title: "Текстовая версия урока", content: [{ type: "paragraph", spans: [{ text: "Текст урока" }] }], defaultExpanded: false },
  KEY_TAKEAWAYS: { title: "Главное из урока", items: [{ id: "1", title: "Заголовок", text: "Описание", variant: "DEFAULT", order: 1 }] },
  IMAGE: {},
  TEXT: { doc: [] },
  INFO_CARD: { title: "Заголовок", text: "Описание", variant: "DEFAULT" },
  CHECKLIST: { items: [{ text: "Пункт" }] },
  SUMMARY: { points: ["Итог"] },
};
const ADD_TYPES = ["VIDEO", "COLLAPSIBLE_TEXT", "KEY_TAKEAWAYS", "TEXT", "IMAGE", "INFO_CARD", "CHECKLIST", "SUMMARY"] as const;
const TYPE_LABEL: Record<string, string> = {
  VIDEO: "Видео", COLLAPSIBLE_TEXT: "Текстовая версия", KEY_TAKEAWAYS: "Главное из урока",
  TEXT: "Текст", IMAGE: "Изображение", INFO_CARD: "Инфо-карточка", CHECKLIST: "Чек-лист", SUMMARY: "Итоги",
};

export default function LessonEditorPage() {
  const { id } = useParams<{ id: string }>();
  const [lesson, setLesson] = useState<AdminLessonDetail | null>(null);
  const [publishErrors, setPublishErrors] = useState<{ field: string; message: string }[]>([]);
  const [publishWarnings, setPublishWarnings] = useState<{ code: string; message: string }[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [addType, setAddType] = useState<string>("TEXT");

  // local field state
  const [form, setForm] = useState({ title: "", slug: "", shortDescription: "", durationMinutes: 0, xpReward: 0, isRequired: true });

  const load = useCallback(async () => {
    const { lesson, publishErrors, publishWarnings } = await adminApi.getLesson(id);
    setLesson(lesson);
    setPublishErrors(publishErrors);
    setPublishWarnings(publishWarnings ?? []);
    setForm({
      title: lesson.title,
      slug: lesson.slug,
      shortDescription: lesson.shortDescription ?? "",
      durationMinutes: lesson.durationMinutes,
      xpReward: lesson.xpReward,
      isRequired: lesson.isRequired,
    });
  }, [id]);

  useEffect(() => {
    void load().catch(() => setMsg("Не удалось загрузить урок"));
  }, [load]);

  if (!lesson) {
    return <p className="text-sm text-muted-foreground">{msg ?? "Загрузка…"}</p>;
  }

  const published = lesson.status === "PUBLISHED";
  const flash = (t: string) => { setMsg(t); setTimeout(() => setMsg(null), 3000); };

  const saveFields = async () => {
    try {
      await adminApi.updateLesson(id, {
        title: form.title,
        slug: form.slug,
        shortDescription: form.shortDescription || null,
        durationMinutes: form.durationMinutes,
        xpReward: form.xpReward,
        isRequired: form.isRequired,
      });
      await load();
      flash("Сохранено");
    } catch (e) {
      flash(e instanceof ApiError && e.code === "lesson_published_readonly" ? "Сначала снимите с публикации" : "Ошибка сохранения");
    }
  };

  const addBlock = async () => {
    try {
      await adminApi.createBlock(id, addType, BLOCK_DEFAULTS[addType]);
      await load();
    } catch (e) {
      flash(e instanceof ApiError && e.code === "lesson_published_readonly" ? "Сначала снимите с публикации" : "Ошибка");
    }
  };

  const move = async (index: number, dir: -1 | 1) => {
    const ids = lesson.blocks.map((b) => b.id);
    const j = index + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j], ids[index]];
    await adminApi.reorderBlocks(id, ids);
    await load();
  };

  const publish = async () => {
    try {
      await adminApi.publishLesson(id);
      await load();
      flash("Урок опубликован ✓");
    } catch (e) {
      if (e instanceof ApiError && e.code === "publish_validation_failed" && Array.isArray(e.fields)) {
        setPublishErrors(e.fields as { field: string; message: string }[]);
        flash("Исправьте ошибки перед публикацией");
      } else {
        flash("Не удалось опубликовать");
      }
    }
  };

  const setStatus = async (status: "DRAFT" | "ARCHIVED") => {
    await adminApi.setLessonStatus(id, status);
    await load();
    flash(status === "DRAFT" ? "Снято с публикации" : "В архиве");
  };

  return (
    <div className="pb-16">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/admin/content" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> К обучению
        </Link>
        <div className="flex items-center gap-2">
          <StatusBadge status={lesson.status} />
          <a href={`/academy/lesson/${lesson.slug}?preview=1`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 rounded-2xl border border-border px-3 py-2 text-sm hover:bg-muted">
            <Eye className="size-4" /> Предпросмотр
          </a>
          {published ? (
            <button onClick={() => setStatus("DRAFT")} className="rounded-2xl border border-border px-3 py-2 text-sm hover:bg-muted">Снять с публикации</button>
          ) : (
            <button onClick={publish} className="flex items-center gap-1.5 rounded-2xl bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground">
              <Rocket className="size-4" /> Опубликовать
            </button>
          )}
        </div>
      </div>

      <h1 className="mt-4 text-2xl font-bold">{lesson.title}</h1>
      <p className="text-sm text-muted-foreground">{lesson.course.program.title} · {lesson.course.title}</p>

      {/* Informational structure checklist (does not change publish rules). */}
      <div className="mt-3 flex flex-wrap gap-2">
        {[
          { label: "Видео", ok: lesson.blocks.some((b) => b.type === "VIDEO") },
          { label: "Текст", ok: lesson.blocks.some((b) => b.type === "COLLAPSIBLE_TEXT") },
          { label: "Главное", ok: lesson.blocks.some((b) => b.type === "KEY_TAKEAWAYS") },
          { label: "Тест", ok: Boolean(lesson.quiz) },
        ].map((s) => (
          <span
            key={s.label}
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${s.ok ? "bg-success-soft text-success" : "bg-muted text-muted-foreground"}`}
          >
            {s.ok ? <CheckCircle2 className="size-3.5" /> : <span className="size-1.5 rounded-full bg-muted-foreground/50" />}
            {s.label}
          </span>
        ))}
      </div>

      {msg && <div className="mt-3 rounded-2xl bg-brand/12 px-4 py-2 text-sm text-foreground">{msg}</div>}

      {published && (
        <div className="mt-3 rounded-2xl border border-brand/40 bg-brand/10 px-4 py-3 text-sm">
          Урок опубликован и доступен сотрудникам. Чтобы редактировать блоки/тест, снимите его с публикации.
        </div>
      )}

      {!published && publishErrors.length > 0 && (
        <div className="mt-3 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm">
          <p className="font-semibold text-red-500">Перед публикацией:</p>
          <ul className="mt-1 list-disc pl-5 text-muted-foreground">
            {publishErrors.map((e, i) => <li key={i}>{e.message}</li>)}
          </ul>
        </div>
      )}

      {!published && publishErrors.length === 0 && publishWarnings.length > 0 && (
        <div className="mt-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
          <p className="font-semibold text-amber-600 dark:text-amber-500">Рекомендации (не блокируют публикацию):</p>
          <ul className="mt-1 list-disc pl-5 text-muted-foreground">
            {publishWarnings.map((w, i) => <li key={i}>{w.message}</li>)}
          </ul>
        </div>
      )}

      {/* Fields */}
      <section className="mt-6 rounded-3xl border border-border bg-card p-5">
        <h2 className="mb-4 font-bold">Параметры урока</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Название"><TextInput value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} disabled={published} /></Field>
          <Field label="Slug" hint="латиница-с-дефисами"><TextInput value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} disabled={published} /></Field>
          <Field label="Длительность (мин)"><TextInput type="number" value={form.durationMinutes} onChange={(e) => setForm({ ...form, durationMinutes: Number(e.target.value) })} disabled={published} /></Field>
          <Field label="XP за урок"><TextInput type="number" value={form.xpReward} onChange={(e) => setForm({ ...form, xpReward: Number(e.target.value) })} disabled={published} /></Field>
          <div className="sm:col-span-2">
            <Field label="Краткое описание"><TextArea value={form.shortDescription} onChange={(e) => setForm({ ...form, shortDescription: e.target.value })} disabled={published} rows={2} /></Field>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.isRequired} onChange={(e) => setForm({ ...form, isRequired: e.target.checked })} disabled={published} />
            Обязательный урок (влияет на гейтинг)
          </label>
        </div>
        {!published && (
          <button onClick={saveFields} className="mt-4 flex items-center gap-1.5 rounded-2xl bg-foreground px-5 py-2.5 text-sm font-semibold text-background">
            <CheckCircle2 className="size-4" /> Сохранить параметры
          </button>
        )}
      </section>

      {/* Blocks */}
      <section className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-bold">Блоки урока</h2>
          {!published && (
            <div className="flex items-center gap-2">
              <select className={fieldCls + " w-auto"} value={addType} onChange={(e) => setAddType(e.target.value)}>
                {ADD_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
              </select>
              <button onClick={addBlock} className="flex items-center gap-1 rounded-2xl bg-brand px-3 py-2.5 text-sm font-semibold text-brand-foreground">
                <Plus className="size-4" /> Добавить блок
              </button>
            </div>
          )}
        </div>
        <div className="space-y-3">
          {lesson.blocks.map((block, i) => (
            <BlockEditor
              key={block.id}
              block={block}
              disabled={published}
              onMoveUp={i > 0 ? () => move(i, -1) : undefined}
              onMoveDown={i < lesson.blocks.length - 1 ? () => move(i, 1) : undefined}
              onSave={async (data) => { await adminApi.updateBlock(block.id, { data }); await load(); flash("Блок сохранён"); }}
              onDelete={async () => { if (confirm("Удалить блок?")) { await adminApi.deleteBlock(block.id); await load(); } }}
            />
          ))}
          {lesson.blocks.length === 0 && <p className="text-sm text-muted-foreground">Пока нет блоков. Добавьте первый.</p>}
        </div>
      </section>

      {/* Quiz */}
      <section className="mt-8 rounded-3xl border border-border bg-card p-5">
        <h2 className="mb-4 font-bold">Тест {lesson.quiz ? "" : "(необязательно)"}</h2>
        <QuizBuilder lessonId={id} initial={lesson.quiz} disabled={published} onSaved={load} />
      </section>
    </div>
  );
}
