"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { fieldCls } from "@/components/admin/ui";

export interface ChecklistDraftItem {
  id?: string; // preserved for existing items (stable identity)
  text: string;
  required: boolean;
}

/** Reusable checklist editor: add / edit / remove / reorder / required toggle. */
export function ChecklistEditor({
  items,
  onChange,
}: {
  items: ChecklistDraftItem[];
  onChange: (items: ChecklistDraftItem[]) => void;
}) {
  const update = (i: number, patch: Partial<ChecklistDraftItem>) =>
    onChange(items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  const remove = (i: number) => onChange(items.filter((_, idx) => idx !== i));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const copy = items.slice();
    [copy[i], copy[j]] = [copy[j], copy[i]];
    onChange(copy);
  };

  return (
    <div className="space-y-2">
      {items.map((it, i) => (
        <div key={it.id ?? i} className="flex items-center gap-2">
          <input
            className={fieldCls}
            value={it.text}
            placeholder={`Пункт ${i + 1}`}
            onChange={(e) => update(i, { text: e.target.value })}
          />
          <label className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
            <input type="checkbox" checked={it.required} onChange={(e) => update(i, { required: e.target.checked })} /> обяз.
          </label>
          <button onClick={() => move(i, -1)} disabled={i === 0} className="shrink-0 rounded-lg p-1.5 hover:bg-muted disabled:opacity-30"><ArrowUp className="size-4" /></button>
          <button onClick={() => move(i, 1)} disabled={i === items.length - 1} className="shrink-0 rounded-lg p-1.5 hover:bg-muted disabled:opacity-30"><ArrowDown className="size-4" /></button>
          <button onClick={() => remove(i)} className="shrink-0 rounded-lg p-1.5 text-red-500 hover:bg-red-500/10"><Trash2 className="size-4" /></button>
        </div>
      ))}
      <button
        onClick={() => onChange([...items, { text: "", required: true }])}
        className="flex items-center gap-1 rounded-2xl border border-border px-3 py-2 text-sm hover:bg-muted"
      >
        <Plus className="size-4" /> Добавить пункт
      </button>
    </div>
  );
}
