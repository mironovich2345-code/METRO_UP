"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronUp, Eye, Image as ImageIcon, Info, ListChecks, ListOrdered, Pencil, Plus, Trash2, Type, X } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { instructionsAdminApi } from "@/lib/api/knowledge-client";
import type { InstructionAdminRowDTO, InstructionCategoryDTO, InstructionAdminDetailDTO, InstructionBlockDTO } from "@/lib/api/knowledge-types";
import { Field, TextArea, TextInput, StatusBadge, InlineCreate, fieldCls } from "@/components/admin/ui";
import { RichTextField, StringListEditor } from "@/components/control/knowledge-ui";
import { MediaUploadField } from "@/components/admin/MediaUploadField";
import { InstructionBlocksView } from "@/components/knowledge/InstructionBlocksView";
import { Modal } from "@/components/control/Modal";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

let localId = 0;
const nextId = () => `local-${localId++}`;

function newBlock(type: InstructionBlockDTO["type"]): InstructionBlockDTO {
  const id = nextId();
  switch (type) {
    case "TEXT": return { id, type, doc: [] };
    case "STEPS": return { id, type, title: "", steps: [] };
    case "CHECKLIST": return { id, type, title: "", items: [] };
    case "INFO_CARD": return { id, type, title: "", text: "" };
    case "WARNING": return { id, type, title: "", text: "" };
    case "IMAGE": return { id, type, mediaAssetId: null, url: null, alt: "", caption: "" };
  }
}

export function InstructionsAdmin() {
  const [rows, setRows] = useState<InstructionAdminRowDTO[]>([]);
  const [categories, setCategories] = useState<InstructionCategoryDTO[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "denied">("loading");
  const [filter, setFilter] = useState({ categoryId: "", status: "", q: "" });
  const [editing, setEditing] = useState<InstructionAdminDetailDTO | null>(null);
  const [showCats, setShowCats] = useState(false);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const data = await instructionsAdminApi.list({
        categoryId: filter.categoryId || undefined,
        status: filter.status || undefined,
        q: filter.q || undefined,
      });
      setRows(data.instructions);
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
      updatedAt: new Date().toISOString(), summary: null, blocks: [], publishedAt: null,
    });
  };
  const openEdit = async (id: string) => {
    try { setEditing((await instructionsAdminApi.get(id)).instruction); } catch { /* ignore */ }
  };

  if (status === "denied") return <p className="text-sm text-muted-foreground">Недостаточно прав.</p>;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Инструкции</h1>
          <p className="mt-1 text-sm text-muted-foreground">Регламенты и рабочие инструкции для смены</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowCats(true)} className="rounded-2xl border border-border px-4 py-2.5 text-sm font-semibold hover:bg-muted">Категории</button>
          <button onClick={openNew} className="flex items-center gap-1.5 rounded-2xl bg-brand px-4 py-2.5 text-sm font-semibold text-brand-foreground">
            <Plus className="size-4" /> Создать инструкцию
          </button>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <select value={filter.categoryId} onChange={(e) => setFilter((f) => ({ ...f, categoryId: e.target.value }))} className={fieldCls}>
          <option value="">Все категории</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
        <select value={filter.status} onChange={(e) => setFilter((f) => ({ ...f, status: e.target.value }))} className={fieldCls}>
          <option value="">Любой статус</option>
          <option value="DRAFT">Черновик</option>
          <option value="PUBLISHED">Опубликована</option>
          <option value="ARCHIVED">В архиве</option>
        </select>
        <input value={filter.q} onChange={(e) => setFilter((f) => ({ ...f, q: e.target.value }))} placeholder="Поиск по названию" className={fieldCls} />
      </div>

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
            {status === "ready" && rows.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Инструкций пока нет</td></tr>}
            {rows.map((w) => (
              <tr key={w.id} className="border-t border-border">
                <td className="px-4 py-3 text-muted-foreground">{w.categoryTitle}</td>
                <td className="px-4 py-3 font-medium">{w.title}</td>
                <td className="px-4 py-3"><StatusBadge status={w.status} /></td>
                <td className="px-4 py-3 text-muted-foreground">{fmtDate(w.updatedAt)}</td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => openEdit(w.id)} className="inline-flex items-center gap-1 text-sm font-semibold text-brand hover:underline">
                    <Pencil className="size-3.5" /> Открыть
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showCats && <CategoryManager categories={categories} onClose={() => setShowCats(false)} onChanged={load} />}
      {editing && <InstructionEditor initial={editing} categories={categories} onClose={() => setEditing(null)} onSaved={load} />}
    </div>
  );
}

/* -------------------------------- editor --------------------------------- */

const ADD_BUTTONS: { type: InstructionBlockDTO["type"]; label: string; icon: typeof Type }[] = [
  { type: "TEXT", label: "Текст", icon: Type },
  { type: "STEPS", label: "Шаги", icon: ListOrdered },
  { type: "CHECKLIST", label: "Чек-лист", icon: ListChecks },
  { type: "INFO_CARD", label: "Важная информация", icon: Info },
  { type: "WARNING", label: "Предупреждение", icon: AlertTriangle },
  { type: "IMAGE", label: "Изображение", icon: ImageIcon },
];

function InstructionEditor({
  initial, categories, onClose, onSaved,
}: {
  initial: InstructionAdminDetailDTO;
  categories: InstructionCategoryDTO[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [id, setId] = useState(initial.id);
  const [statusVal, setStatusVal] = useState(initial.status);
  const [title, setTitle] = useState(initial.title);
  const [categoryId, setCategoryId] = useState(initial.categoryId);
  const [summary, setSummary] = useState(initial.summary ?? "");
  const [blocks, setBlocks] = useState<InstructionBlockDTO[]>(initial.blocks);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const readonly = statusVal === "PUBLISHED";

  const add = (type: InstructionBlockDTO["type"]) => setBlocks((b) => [...b, newBlock(type)]);
  const updateBlock = (i: number, patch: Partial<InstructionBlockDTO>) =>
    setBlocks((b) => b.map((blk, idx) => (idx === i ? ({ ...blk, ...patch } as InstructionBlockDTO) : blk)));
  const removeBlock = (i: number) => setBlocks((b) => b.filter((_, idx) => idx !== i));
  const move = (i: number, dir: -1 | 1) => setBlocks((b) => {
    const j = i + dir; if (j < 0 || j >= b.length) return b;
    const next = [...b]; [next[i], next[j]] = [next[j], next[i]]; return next;
  });

  const save = async (): Promise<string | null> => {
    setBusy(true); setErr(null);
    try {
      const body = { title, categoryId, summary: summary || null, blocks };
      if (!id) { const res = await instructionsAdminApi.create(body); setId(res.instruction.id); setStatusVal(res.instruction.status); onSaved(); return res.instruction.id; }
      const res = await instructionsAdminApi.update(id, body); setStatusVal(res.instruction.status); onSaved(); return id;
    } catch (e) { setErr(e instanceof ApiError ? errText(e) : "Ошибка сохранения"); return null; }
    finally { setBusy(false); }
  };
  const publish = async () => {
    const savedId = id || (await save());
    if (!savedId) return;
    setBusy(true); setErr(null);
    try { const res = await instructionsAdminApi.publish(savedId); setStatusVal(res.instruction.status); onSaved(); }
    catch (e) { setErr(e instanceof ApiError ? errText(e) : "Ошибка публикации"); }
    finally { setBusy(false); }
  };
  const setStatusTo = async (s: "DRAFT" | "ARCHIVED") => {
    if (!id) return;
    setBusy(true); setErr(null);
    try { const res = await instructionsAdminApi.setStatus(id, s); setStatusVal(res.instruction.status); onSaved(); }
    catch (e) { setErr(e instanceof ApiError ? errText(e) : "Ошибка"); }
    finally { setBusy(false); }
  };

  return (
    <Modal onClose={onClose} size="2xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold">{id ? "Редактирование инструкции" : "Новая инструкция"}</h2>
            <StatusBadge status={statusVal} />
          </div>
          <button onClick={onClose} className="rounded-xl p-2 hover:bg-muted"><X className="size-5" /></button>
        </div>

        {readonly && <p className="mt-3 rounded-2xl bg-muted px-4 py-2.5 text-xs text-muted-foreground">Инструкция опубликована. Чтобы редактировать — верните её в черновик.</p>}
        {err && <p className="mt-3 rounded-2xl bg-red-500/10 px-4 py-2.5 text-xs text-red-500">{err}</p>}

        {preview ? (
          <div className="mt-4 space-y-3 rounded-2xl bg-background p-4">
            <h3 className="text-xl font-bold">{title || "Без названия"}</h3>
            {summary && <p className="text-sm text-muted-foreground">{summary}</p>}
            <InstructionBlocksView blocks={blocks} />
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <Field label="Название"><TextInput value={title} disabled={readonly} onChange={(e) => setTitle(e.target.value)} placeholder="Например: Как оформить гостевой визит" /></Field>
            <Field label="Категория">
              <select value={categoryId} disabled={readonly} onChange={(e) => setCategoryId(e.target.value)} className={fieldCls}>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
            </Field>
            <Field label="Краткое описание (необязательно)"><TextInput value={summary} disabled={readonly} onChange={(e) => setSummary(e.target.value)} /></Field>

            <div className="space-y-3">
              {blocks.map((b, i) => (
                <BlockCard
                  key={b.id} block={b} index={i} total={blocks.length} readonly={readonly}
                  onUp={() => move(i, -1)} onDown={() => move(i, 1)} onRemove={() => removeBlock(i)}
                  onChange={(patch) => updateBlock(i, patch)}
                />
              ))}
              {blocks.length === 0 && <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">Добавьте первый блок ниже</p>}
            </div>

            {!readonly && (
              <div className="flex flex-wrap gap-2">
                {ADD_BUTTONS.map((btn) => {
                  const Icon = btn.icon;
                  return (
                    <button key={btn.type} onClick={() => add(btn.type)} className="flex items-center gap-1.5 rounded-2xl border border-dashed border-border px-3 py-2 text-sm font-medium text-muted-foreground hover:border-brand/40 hover:text-foreground">
                      <Icon className="size-4" /> {btn.label}
                    </button>
                  );
                })}
              </div>
            )}
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

const BLOCK_LABEL: Record<InstructionBlockDTO["type"], string> = {
  TEXT: "Текст", STEPS: "Шаги", CHECKLIST: "Чек-лист", INFO_CARD: "Важная информация", WARNING: "Предупреждение", IMAGE: "Изображение",
};

function BlockCard({
  block, index, total, readonly, onUp, onDown, onRemove, onChange,
}: {
  block: InstructionBlockDTO; index: number; total: number; readonly: boolean;
  onUp: () => void; onDown: () => void; onRemove: () => void; onChange: (patch: Partial<InstructionBlockDTO>) => void;
}) {
  return (
    <div className="rounded-2xl border border-border bg-background p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{BLOCK_LABEL[block.type]}</span>
        {!readonly && (
          <div className="flex items-center gap-1">
            <button onClick={onUp} disabled={index === 0} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-30"><ChevronUp className="size-4" /></button>
            <button onClick={onDown} disabled={index === total - 1} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-30"><ChevronDown className="size-4" /></button>
            <button onClick={onRemove} className="rounded-lg p-1.5 text-red-500 hover:bg-red-500/10"><Trash2 className="size-4" /></button>
          </div>
        )}
      </div>

      {block.type === "TEXT" && (
        <RichTextField value={block.doc} rows={5} onChange={(doc) => onChange({ doc })} />
      )}
      {(block.type === "INFO_CARD" || block.type === "WARNING") && (
        <div className="space-y-2">
          <TextInput value={block.title ?? ""} disabled={readonly} onChange={(e) => onChange({ title: e.target.value })} placeholder="Заголовок (необязательно)" />
          <TextArea value={block.text} disabled={readonly} onChange={(e) => onChange({ text: e.target.value })} placeholder={block.type === "WARNING" ? "Важное ограничение или предупреждение" : "Полезная информация"} />
        </div>
      )}
      {block.type === "STEPS" && (
        <div className="space-y-2">
          <TextInput value={block.title ?? ""} disabled={readonly} onChange={(e) => onChange({ title: e.target.value })} placeholder="Заголовок (необязательно)" />
          <StringListEditor items={block.steps.map((s) => s.text)} onChange={(texts) => onChange({ steps: texts.map((t, i) => ({ id: block.steps[i]?.id ?? `local-s-${i}-${index}`, text: t })) })} placeholder="Шаг" addLabel="Добавить шаг" />
        </div>
      )}
      {block.type === "CHECKLIST" && (
        <div className="space-y-2">
          <TextInput value={block.title ?? ""} disabled={readonly} onChange={(e) => onChange({ title: e.target.value })} placeholder="Заголовок (необязательно)" />
          <StringListEditor items={block.items.map((s) => s.text)} onChange={(texts) => onChange({ items: texts.map((t, i) => ({ id: block.items[i]?.id ?? `local-i-${i}-${index}`, text: t })) })} placeholder="Пункт чек-листа" addLabel="Добавить пункт" />
          <p className="text-xs text-muted-foreground">Справочный чек-лист. Не создаёт задачу в плане дня.</p>
        </div>
      )}
      {block.type === "IMAGE" && <ImageBlockEditor block={block} readonly={readonly} onChange={onChange} />}
    </div>
  );
}

function ImageBlockEditor({
  block, readonly, onChange,
}: {
  block: Extract<InstructionBlockDTO, { type: "IMAGE" }>;
  readonly: boolean;
  onChange: (patch: Partial<InstructionBlockDTO>) => void;
}) {
  // Prefer the server-resolved URL; after a fresh upload show a local object URL.
  const [preview, setPreview] = useState<string | null>(block.url);
  return (
    <div className="space-y-2">
      {!readonly && (
        <MediaUploadField
          kind="IMAGE"
          currentId={block.mediaAssetId || undefined}
          onUploaded={(id) => onChange({ mediaAssetId: id })}
          onLocalPreview={(u) => setPreview(u)}
        />
      )}
      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt={block.alt ?? ""} className="max-h-64 w-auto max-w-full rounded-2xl border border-border object-contain" />
      ) : (
        <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">
          Загрузите изображение (JPEG, PNG или WebP)
        </p>
      )}
      <TextInput value={block.alt ?? ""} disabled={readonly} onChange={(e) => onChange({ alt: e.target.value })} placeholder="Alt-текст для доступности (необязательно)" />
      <TextInput value={block.caption ?? ""} disabled={readonly} onChange={(e) => onChange({ caption: e.target.value })} placeholder="Подпись, напр. «Кнопка “Журнал платежей” в CRAFT» (необязательно)" />
    </div>
  );
}

function errText(e: ApiError): string {
  const map: Record<string, string> = {
    empty_instruction: "Добавьте хотя бы один непустой блок перед публикацией",
    instruction_published_readonly: "Инструкция опубликована — верните её в черновик для правки",
    validation_error: "Проверьте заполнение блоков",
    category_not_found: "Категория не найдена",
  };
  return map[e.code] ?? "Ошибка запроса";
}

/* --------------------------- category manager ---------------------------- */

function CategoryManager({
  categories, onClose, onChanged,
}: {
  categories: InstructionCategoryDTO[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const create = async (title: string) => { setBusy(true); try { await instructionsAdminApi.createCategory({ title }); onChanged(); } finally { setBusy(false); } };
  const toggle = async (c: InstructionCategoryDTO) => { setBusy(true); try { await instructionsAdminApi.updateCategory(c.id, { isActive: !c.isActive }); onChanged(); } finally { setBusy(false); } };
  const move = async (c: InstructionCategoryDTO, dir: -1 | 1) => { setBusy(true); try { await instructionsAdminApi.updateCategory(c.id, { order: Math.max(0, c.order + dir) }); onChanged(); } finally { setBusy(false); } };
  return (
    <Modal onClose={onClose} size="lg">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Категории инструкций</h2>
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
                <p className="text-xs text-muted-foreground">{c.instructionCount ?? 0} инструкций</p>
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
