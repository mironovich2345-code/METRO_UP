"use client";

import { useCallback, useEffect, useState } from "react";
import { Eye, Pencil, Plus, X } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { scriptsAdminApi } from "@/lib/api/knowledge-client";
import type { ScriptAdminRowDTO, ScriptCategoryDTO, ScriptAdminDetailDTO, ScriptContentDTO } from "@/lib/api/knowledge-types";
import { Field, TextArea, TextInput, StatusBadge, InlineCreate, fieldCls } from "@/components/admin/ui";
import { RichTextField, StringListEditor } from "@/components/control/knowledge-ui";
import { Modal } from "@/components/control/Modal";
import { RichText } from "@/components/academy/lesson/RichText";

const EMPTY_CONTENT: ScriptContentDTO = { whenToUse: "", goal: "", keyQuestions: [], script: [], doNotSay: [], nextStep: "" };

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function ScriptsAdmin() {
  const [scripts, setScripts] = useState<ScriptAdminRowDTO[]>([]);
  const [categories, setCategories] = useState<ScriptCategoryDTO[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "denied">("loading");
  const [filter, setFilter] = useState<{ categoryId: string; status: string; q: string }>({ categoryId: "", status: "", q: "" });
  const [editing, setEditing] = useState<ScriptAdminDetailDTO | null>(null);
  const [showCats, setShowCats] = useState(false);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const data = await scriptsAdminApi.list({
        categoryId: filter.categoryId || undefined,
        status: filter.status || undefined,
        q: filter.q || undefined,
      });
      setScripts(data.scripts);
      setCategories(data.categories);
      setStatus("ready");
    } catch (e) {
      setStatus(e instanceof ApiError && (e.status === 403 || e.status === 401) ? "denied" : "error");
    }
  }, [filter]);
  useEffect(() => { void load(); }, [load]);

  const openNew = () => {
    const categoryId = filter.categoryId || categories[0]?.id;
    if (!categoryId) { setShowCats(true); return; }
    setEditing({
      id: "", title: "", slug: "", categoryId, categoryTitle: "", status: "DRAFT", order: 0,
      updatedAt: new Date().toISOString(), description: null, content: { ...EMPTY_CONTENT }, publishedAt: null,
    });
  };
  const openEdit = async (id: string) => {
    try { setEditing((await scriptsAdminApi.get(id)).script); } catch { /* ignore */ }
  };

  if (status === "denied") return <p className="text-sm text-muted-foreground">Недостаточно прав.</p>;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Скрипты</h1>
          <p className="mt-1 text-sm text-muted-foreground">Рабочие сценарии разговоров для менеджеров</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowCats(true)} className="rounded-2xl border border-border px-4 py-2.5 text-sm font-semibold hover:bg-muted">Категории</button>
          <button onClick={openNew} className="flex items-center gap-1.5 rounded-2xl bg-brand px-4 py-2.5 text-sm font-semibold text-brand-foreground">
            <Plus className="size-4" /> Создать скрипт
          </button>
        </div>
      </div>

      {/* filters */}
      <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <select value={filter.categoryId} onChange={(e) => setFilter((f) => ({ ...f, categoryId: e.target.value }))} className={fieldCls}>
          <option value="">Все категории</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
        <select value={filter.status} onChange={(e) => setFilter((f) => ({ ...f, status: e.target.value }))} className={fieldCls}>
          <option value="">Любой статус</option>
          <option value="DRAFT">Черновик</option>
          <option value="PUBLISHED">Опубликован</option>
          <option value="ARCHIVED">В архиве</option>
        </select>
        <input value={filter.q} onChange={(e) => setFilter((f) => ({ ...f, q: e.target.value }))} placeholder="Поиск по названию" className={fieldCls} />
      </div>

      {/* table */}
      <div className="mt-4 overflow-x-auto rounded-3xl border border-border">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Категория</th>
              <th className="px-4 py-3 font-medium">Название</th>
              <th className="px-4 py-3 font-medium">Статус</th>
              <th className="px-4 py-3 font-medium">Обновлено</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {status === "loading" && <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Загрузка…</td></tr>}
            {status === "ready" && scripts.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Скриптов пока нет</td></tr>}
            {scripts.map((s) => (
              <tr key={s.id} className="border-t border-border">
                <td className="px-4 py-3 text-muted-foreground">{s.categoryTitle}</td>
                <td className="px-4 py-3 font-medium">{s.title}</td>
                <td className="px-4 py-3"><StatusBadge status={s.status} /></td>
                <td className="px-4 py-3 text-muted-foreground">{fmtDate(s.updatedAt)}</td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => openEdit(s.id)} className="inline-flex items-center gap-1 text-sm font-semibold text-brand hover:underline">
                    <Pencil className="size-3.5" /> Открыть
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showCats && (
        <CategoryManager
          categories={categories}
          onClose={() => setShowCats(false)}
          onChanged={load}
        />
      )}
      {editing && (
        <ScriptEditor
          initial={editing}
          categories={categories}
          onClose={() => setEditing(null)}
          onSaved={() => { void load(); }}
        />
      )}
    </div>
  );
}

/* -------------------------------- editor --------------------------------- */

function ScriptEditor({
  initial, categories, onClose, onSaved,
}: {
  initial: ScriptAdminDetailDTO;
  categories: ScriptCategoryDTO[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [id, setId] = useState(initial.id);
  const [statusVal, setStatusVal] = useState(initial.status);
  const [title, setTitle] = useState(initial.title);
  const [categoryId, setCategoryId] = useState(initial.categoryId);
  const [description, setDescription] = useState(initial.description ?? "");
  const [content, setContent] = useState<ScriptContentDTO>(initial.content);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const readonly = statusVal === "PUBLISHED";

  const patch = (p: Partial<ScriptContentDTO>) => setContent((c) => ({ ...c, ...p }));

  const save = async (): Promise<string | null> => {
    setBusy(true); setErr(null);
    try {
      const body = { title, categoryId, description: description || null, content };
      if (!id) {
        const res = await scriptsAdminApi.create(body);
        setId(res.script.id); setStatusVal(res.script.status);
        onSaved();
        return res.script.id;
      }
      const res = await scriptsAdminApi.update(id, body);
      setStatusVal(res.script.status);
      onSaved();
      return id;
    } catch (e) {
      setErr(e instanceof ApiError ? errText(e) : "Ошибка сохранения");
      return null;
    } finally { setBusy(false); }
  };

  const publish = async () => {
    const savedId = id || (await save());
    if (!savedId) return;
    setBusy(true); setErr(null);
    try {
      const res = await scriptsAdminApi.publish(savedId);
      setStatusVal(res.script.status);
      onSaved();
    } catch (e) { setErr(e instanceof ApiError ? errText(e) : "Ошибка публикации"); }
    finally { setBusy(false); }
  };
  const setStatusTo = async (s: "DRAFT" | "ARCHIVED") => {
    if (!id) return;
    setBusy(true); setErr(null);
    try { const res = await scriptsAdminApi.setStatus(id, s); setStatusVal(res.script.status); onSaved(); }
    catch (e) { setErr(e instanceof ApiError ? errText(e) : "Ошибка"); }
    finally { setBusy(false); }
  };

  return (
    <Modal onClose={onClose} size="2xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold">{id ? "Редактирование скрипта" : "Новый скрипт"}</h2>
            <StatusBadge status={statusVal} />
          </div>
          <button onClick={onClose} className="rounded-xl p-2 hover:bg-muted"><X className="size-5" /></button>
        </div>

        {readonly && (
          <p className="mt-3 rounded-2xl bg-muted px-4 py-2.5 text-xs text-muted-foreground">
            Скрипт опубликован и доступен сотрудникам. Чтобы редактировать — верните его в черновик.
          </p>
        )}
        {err && <p className="mt-3 rounded-2xl bg-red-500/10 px-4 py-2.5 text-xs text-red-500">{err}</p>}

        {preview ? (
          <ScriptPreview title={title} description={description} content={content} />
        ) : (
          <div className="mt-4 space-y-4">
            <Field label="Название"><TextInput value={title} disabled={readonly} onChange={(e) => setTitle(e.target.value)} placeholder="Например: Возражение «Дорого»" /></Field>
            <Field label="Категория">
              <select value={categoryId} disabled={readonly} onChange={(e) => setCategoryId(e.target.value)} className={fieldCls}>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
            </Field>
            <Field label="Краткое описание (необязательно)"><TextInput value={description} disabled={readonly} onChange={(e) => setDescription(e.target.value)} /></Field>
            <Field label="Когда использовать"><TextArea value={content.whenToUse} disabled={readonly} onChange={(e) => patch({ whenToUse: e.target.value })} /></Field>
            <Field label="Цель разговора"><TextArea value={content.goal} disabled={readonly} onChange={(e) => patch({ goal: e.target.value })} /></Field>
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">Ключевые вопросы</p>
              {readonly ? <ReadonlyList items={content.keyQuestions} /> : <StringListEditor items={content.keyQuestions} onChange={(keyQuestions) => patch({ keyQuestions })} placeholder="Вопрос клиенту" addLabel="Добавить вопрос" />}
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">Сценарий разговора</p>
              {readonly ? <RichText doc={content.script} /> : <RichTextField value={content.script} onChange={(script) => patch({ script })} />}
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">Не говорить</p>
              {readonly ? <ReadonlyList items={content.doNotSay} /> : <StringListEditor items={content.doNotSay} onChange={(doNotSay) => patch({ doNotSay })} placeholder="Фраза, которую не стоит говорить" addLabel="Добавить пункт" />}
            </div>
            <Field label="Следующий шаг"><TextArea value={content.nextStep} disabled={readonly} onChange={(e) => patch({ nextStep: e.target.value })} /></Field>
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-border pt-4">
          <button onClick={() => setPreview((p) => !p)} className="flex items-center gap-1.5 rounded-2xl border border-border px-4 py-2.5 text-sm font-semibold hover:bg-muted">
            <Eye className="size-4" /> {preview ? "Редактировать" : "Предпросмотр"}
          </button>
          <div className="flex-1" />
          {!readonly && <button onClick={save} disabled={busy || title.trim().length < 2} className="rounded-2xl border border-border px-4 py-2.5 text-sm font-semibold hover:bg-muted disabled:opacity-50">Сохранить</button>}
          {statusVal === "DRAFT" && <button onClick={publish} disabled={busy || title.trim().length < 2} className="rounded-2xl bg-brand px-4 py-2.5 text-sm font-semibold text-brand-foreground disabled:opacity-50">Опубликовать</button>}
          {statusVal === "PUBLISHED" && <button onClick={() => setStatusTo("DRAFT")} disabled={busy} className="rounded-2xl bg-brand px-4 py-2.5 text-sm font-semibold text-brand-foreground disabled:opacity-50">Вернуть в черновик</button>}
          {id && statusVal !== "ARCHIVED" && <button onClick={() => setStatusTo("ARCHIVED")} disabled={busy} className="rounded-2xl border border-border px-4 py-2.5 text-sm font-semibold text-muted-foreground hover:bg-muted disabled:opacity-50">В архив</button>}
        </div>
    </Modal>
  );
}

function errText(e: ApiError): string {
  const map: Record<string, string> = {
    empty_script: "Заполните секцию «Сценарий разговора» перед публикацией",
    script_published_readonly: "Скрипт опубликован — верните его в черновик для правки",
    validation_error: "Проверьте заполнение полей",
    category_not_found: "Категория не найдена",
  };
  return map[e.code] ?? "Ошибка запроса";
}

function ReadonlyList({ items }: { items: string[] }) {
  if (!items.length) return <p className="text-sm text-muted-foreground">—</p>;
  return <ul className="list-disc space-y-1 pl-5 text-sm">{items.map((it, i) => <li key={i}>{it}</li>)}</ul>;
}

function ScriptPreview({ title, description, content }: { title: string; description: string; content: ScriptContentDTO }) {
  return (
    <div className="mt-4 space-y-4 rounded-2xl bg-background p-4">
      <div>
        <h3 className="text-xl font-bold">{title || "Без названия"}</h3>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {content.whenToUse && <Section title="Когда использовать"><p className="text-sm">{content.whenToUse}</p></Section>}
      {content.goal && <Section title="Цель разговора"><p className="text-sm">{content.goal}</p></Section>}
      {content.keyQuestions.length > 0 && <Section title="Ключевые вопросы"><ReadonlyList items={content.keyQuestions} /></Section>}
      {content.script.length > 0 && <Section title="Сценарий разговора"><RichText doc={content.script} /></Section>}
      {content.doNotSay.length > 0 && <Section title="Не говорить"><ReadonlyList items={content.doNotSay} /></Section>}
      {content.nextStep && <Section title="Следующий шаг"><p className="text-sm">{content.nextStep}</p></Section>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      {children}
    </div>
  );
}

/* --------------------------- category manager ---------------------------- */

function CategoryManager({
  categories, onClose, onChanged,
}: {
  categories: ScriptCategoryDTO[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const create = async (title: string) => {
    setBusy(true);
    try { await scriptsAdminApi.createCategory({ title }); onChanged(); } finally { setBusy(false); }
  };
  const toggle = async (c: ScriptCategoryDTO) => {
    setBusy(true);
    try { await scriptsAdminApi.updateCategory(c.id, { isActive: !c.isActive }); onChanged(); } finally { setBusy(false); }
  };
  const move = async (c: ScriptCategoryDTO, dir: -1 | 1) => {
    setBusy(true);
    try { await scriptsAdminApi.updateCategory(c.id, { order: Math.max(0, c.order + dir) }); onChanged(); } finally { setBusy(false); }
  };
  return (
    <Modal onClose={onClose} size="lg">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Категории скриптов</h2>
          <button onClick={onClose} className="rounded-xl p-2 hover:bg-muted"><X className="size-5" /></button>
        </div>
        <div className="mt-4"><InlineCreate placeholder="Новая категория" cta="Добавить" onCreate={create} /></div>
        <div className="mt-4 space-y-2">
          {categories.length === 0 && <p className="text-sm text-muted-foreground">Категорий пока нет</p>}
          {categories.map((c) => (
            <div key={c.id} className="flex items-center gap-2 rounded-2xl border border-border px-3 py-2.5">
              <div className="flex flex-col leading-none">
                <button disabled={busy} onClick={() => move(c, -1)} className="text-muted-foreground hover:text-foreground">▲</button>
                <button disabled={busy} onClick={() => move(c, 1)} className="text-muted-foreground hover:text-foreground">▼</button>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{c.title}</p>
                <p className="text-xs text-muted-foreground">{c.scriptCount ?? 0} скриптов</p>
              </div>
              <button disabled={busy} onClick={() => toggle(c)} className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${c.isActive ? "bg-success-soft text-success" : "bg-muted text-muted-foreground"}`}>
                {c.isActive ? "Активна" : "Скрыта"}
              </button>
            </div>
          ))}
        </div>
    </Modal>
  );
}
