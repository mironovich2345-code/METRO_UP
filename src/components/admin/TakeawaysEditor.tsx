"use client";

import { ArrowDown, ArrowUp, Copy, Plus, Trash2 } from "lucide-react";
import { Field, TextArea, TextInput, fieldCls } from "./ui";

export interface TakeawayItem {
  id: string;
  title: string;
  text: string;
  icon?: string | null;
  variant: "DEFAULT" | "IMPORTANT" | "TIP";
  order: number;
}

const RECOMMENDED_MAX = 6;

/** Builder for KEY_TAKEAWAYS items: add/edit/duplicate/delete/reorder. */
export function TakeawaysEditor({
  items,
  onChange,
}: {
  items: TakeawayItem[];
  onChange: (items: TakeawayItem[]) => void;
}) {
  const commit = (next: TakeawayItem[]) => onChange(next.map((it, i) => ({ ...it, order: i + 1 })));
  const patch = (i: number, p: Partial<TakeawayItem>) => commit(items.map((it, idx) => (idx === i ? { ...it, ...p } : it)));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    commit(next);
  };
  const add = () =>
    commit([...items, { id: crypto.randomUUID(), title: "", text: "", icon: "", variant: "DEFAULT", order: items.length + 1 }]);
  const duplicate = (i: number) => commit([...items.slice(0, i + 1), { ...items[i], id: crypto.randomUUID() }, ...items.slice(i + 1)]);
  const remove = (i: number) => commit(items.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-3">
      {items.map((it, i) => (
        <div key={it.id} className="rounded-2xl border border-border bg-card p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">Карточка {i + 1}</span>
            <div className="flex items-center gap-1">
              <button onClick={() => move(i, -1)} disabled={i === 0} className="rounded-lg p-1.5 hover:bg-muted disabled:opacity-30"><ArrowUp className="size-4" /></button>
              <button onClick={() => move(i, 1)} disabled={i === items.length - 1} className="rounded-lg p-1.5 hover:bg-muted disabled:opacity-30"><ArrowDown className="size-4" /></button>
              <button onClick={() => duplicate(i)} className="rounded-lg p-1.5 hover:bg-muted"><Copy className="size-4" /></button>
              <button onClick={() => remove(i)} className="rounded-lg p-1.5 text-red-500 hover:bg-red-500/10"><Trash2 className="size-4" /></button>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Field label="Заголовок"><TextInput value={it.title} onChange={(e) => patch(i, { title: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Иконка" hint="напр. Clock, Star">
                <TextInput value={it.icon ?? ""} onChange={(e) => patch(i, { icon: e.target.value })} />
              </Field>
              <Field label="Вид">
                <select className={fieldCls} value={it.variant} onChange={(e) => patch(i, { variant: e.target.value as TakeawayItem["variant"] })}>
                  <option value="DEFAULT">Обычная</option>
                  <option value="IMPORTANT">Важно</option>
                  <option value="TIP">Совет</option>
                </select>
              </Field>
            </div>
          </div>
          <div className="mt-2">
            <Field label="Текст"><TextArea rows={2} value={it.text} onChange={(e) => patch(i, { text: e.target.value })} /></Field>
          </div>
        </div>
      ))}

      {items.length > RECOMMENDED_MAX && (
        <p className="text-xs text-amber-600 dark:text-amber-500">
          Рекомендуется не больше {RECOMMENDED_MAX} карточек — так блок читается лучше.
        </p>
      )}

      <button onClick={add} className="flex items-center gap-1 rounded-2xl border border-border px-4 py-2 text-sm hover:bg-muted">
        <Plus className="size-4" /> Добавить карточку
      </button>
    </div>
  );
}
