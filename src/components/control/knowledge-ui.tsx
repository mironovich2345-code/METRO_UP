"use client";

import { GripVertical, Plus, X } from "lucide-react";
import { fieldCls } from "@/components/admin/ui";
import { plainToRichDoc, richDocToPlain } from "@/lib/rich-text";
import type { RichDoc } from "@/lib/server/content-schemas";

/**
 * Reusable CMS field controls for the knowledge base. Rich text is authored as
 * compact markup and stored as the SAME structured RichDoc as Academy (never
 * raw HTML). No admin ever edits JSON by hand.
 */

export function RichTextField({
  value,
  onChange,
  rows = 8,
}: {
  value: RichDoc;
  onChange: (doc: RichDoc) => void;
  rows?: number;
}) {
  return (
    <div>
      <textarea
        value={richDocToPlain(value)}
        onChange={(e) => onChange(plainToRichDoc(e.target.value))}
        rows={rows}
        className={`${fieldCls} resize-y font-mono text-[13px] leading-relaxed`}
        placeholder="Текст сценария…"
      />
      <p className="mt-1 text-xs text-muted-foreground">
        Разметка: <b># Заголовок</b> · <b>- пункт списка</b> · <b>&gt; цитата</b> · <b>**жирный**</b> · <b>*курсив*</b> · пустая строка — новый абзац
      </p>
    </div>
  );
}

/** Ordered list of short strings (key questions / phrases-not-to-say / steps). */
export function StringListEditor({
  items,
  onChange,
  placeholder,
  addLabel = "Добавить",
}: {
  items: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  addLabel?: string;
}) {
  const set = (i: number, v: string) => onChange(items.map((it, idx) => (idx === i ? v : it)));
  const remove = (i: number) => onChange(items.filter((_, idx) => idx !== i));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  return (
    <div className="space-y-2">
      {items.map((it, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="flex flex-col text-muted-foreground">
            <button type="button" onClick={() => move(i, -1)} className="leading-none hover:text-foreground" aria-label="Вверх">
              <GripVertical className="size-4" />
            </button>
          </div>
          <input value={it} onChange={(e) => set(i, e.target.value)} placeholder={placeholder} className={`${fieldCls} flex-1`} />
          <button type="button" onClick={() => remove(i)} className="shrink-0 rounded-xl p-2 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Удалить">
            <X className="size-4" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...items, ""])}
        className="flex items-center gap-1.5 rounded-2xl border border-dashed border-border px-3 py-2 text-sm font-medium text-muted-foreground hover:border-brand/40 hover:text-foreground"
      >
        <Plus className="size-4" /> {addLabel}
      </button>
    </div>
  );
}
