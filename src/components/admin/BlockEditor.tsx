"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Save, Trash2 } from "lucide-react";
import type { AdminBlock } from "@/lib/api/content-client";
import { plainToRichDoc, richDocToPlain } from "@/lib/rich-text";
import type { RichDoc } from "@/lib/server/content-schemas";
import { Field, TextArea, TextInput, fieldCls } from "./ui";
import { MediaUploadField } from "./MediaUploadField";
import { TakeawaysEditor, type TakeawayItem } from "./TakeawaysEditor";

const TYPE_LABEL: Record<string, string> = {
  VIDEO: "Видео", TEXT: "Текст", IMAGE: "Изображение",
  COLLAPSIBLE_TEXT: "Текстовая версия", KEY_TAKEAWAYS: "Главное из урока",
  INFO_CARD: "Инфо-карточка", CHECKLIST: "Чек-лист", SUMMARY: "Итоги",
};

type Data = Record<string, unknown>;

export function BlockEditor({
  block,
  disabled,
  onSave,
  onDelete,
  onMoveUp,
  onMoveDown,
}: {
  block: AdminBlock;
  disabled: boolean;
  onSave: (data: unknown) => Promise<void>;
  onDelete: () => Promise<void>;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  const [data, setData] = useState<Data>((block.data as Data) ?? {});
  const [saving, setSaving] = useState(false);
  const set = (patch: Data) => setData((d) => ({ ...d, ...patch }));

  const save = async () => {
    setSaving(true);
    try {
      await onSave(data);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-background p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="rounded-full bg-brand/12 px-2.5 py-1 text-xs font-semibold text-brand">
          {TYPE_LABEL[block.type] ?? block.type}
        </span>
        <div className="flex items-center gap-1">
          <button onClick={onMoveUp} disabled={!onMoveUp || disabled} className="rounded-lg p-1.5 hover:bg-muted disabled:opacity-30"><ArrowUp className="size-4" /></button>
          <button onClick={onMoveDown} disabled={!onMoveDown || disabled} className="rounded-lg p-1.5 hover:bg-muted disabled:opacity-30"><ArrowDown className="size-4" /></button>
          <button onClick={onDelete} disabled={disabled} className="rounded-lg p-1.5 text-red-500 hover:bg-red-500/10 disabled:opacity-30"><Trash2 className="size-4" /></button>
        </div>
      </div>

      <div className="space-y-3">
        {block.type === "VIDEO" && (
          <>
            <MediaUploadField kind="VIDEO" currentId={data.mediaAssetId as string} onUploaded={(id) => set({ mediaAssetId: id })} />
            <Field label="Подпись (необязательно)">
              <TextInput value={(data.caption as string) ?? ""} onChange={(e) => set({ caption: e.target.value })} />
            </Field>
          </>
        )}

        {block.type === "IMAGE" && (
          <>
            <MediaUploadField kind="IMAGE" currentId={data.mediaAssetId as string} onUploaded={(id) => set({ mediaAssetId: id })} />
            <Field label="Alt-текст"><TextInput value={(data.alt as string) ?? ""} onChange={(e) => set({ alt: e.target.value })} /></Field>
            <Field label="Подпись"><TextInput value={(data.caption as string) ?? ""} onChange={(e) => set({ caption: e.target.value })} /></Field>
          </>
        )}

        {block.type === "TEXT" && (
          <Field label="Текст" hint="# заголовок · - список · > цитата · **жирный** · *курсив*">
            <TextArea
              defaultValue={richDocToPlain((data.doc as RichDoc) ?? [])}
              onChange={(e) => set({ doc: plainToRichDoc(e.target.value) })}
              rows={8}
            />
          </Field>
        )}

        {block.type === "COLLAPSIBLE_TEXT" && (
          <>
            <Field label="Заголовок аккордеона">
              <TextInput value={(data.title as string) ?? ""} placeholder="Текстовая версия урока" onChange={(e) => set({ title: e.target.value })} />
            </Field>
            <Field label="Текст урока" hint="# заголовок · - список · > цитата · **жирный** · *курсив*">
              <TextArea
                defaultValue={richDocToPlain((data.content as RichDoc) ?? [])}
                onChange={(e) => set({ content: plainToRichDoc(e.target.value) })}
                rows={12}
              />
            </Field>
            <Field label="По умолчанию">
              <select className={fieldCls} value={data.defaultExpanded ? "1" : "0"} onChange={(e) => set({ defaultExpanded: e.target.value === "1" })}>
                <option value="0">Свёрнут</option>
                <option value="1">Открыт по умолчанию</option>
              </select>
            </Field>
          </>
        )}

        {block.type === "KEY_TAKEAWAYS" && (
          <>
            <Field label="Заголовок блока">
              <TextInput value={(data.title as string) ?? ""} placeholder="Главное из урока" onChange={(e) => set({ title: e.target.value })} />
            </Field>
            <TakeawaysEditor
              items={(data.items as TakeawayItem[]) ?? []}
              onChange={(items) => set({ items })}
            />
          </>
        )}

        {block.type === "INFO_CARD" && (
          <>
            <Field label="Заголовок"><TextInput value={(data.title as string) ?? ""} onChange={(e) => set({ title: e.target.value })} /></Field>
            <Field label="Текст"><TextArea value={(data.text as string) ?? ""} onChange={(e) => set({ text: e.target.value })} /></Field>
            <Field label="Вид">
              <select className={fieldCls} value={(data.variant as string) ?? "DEFAULT"} onChange={(e) => set({ variant: e.target.value })}>
                <option value="DEFAULT">Обычная</option>
                <option value="TIP">Совет</option>
                <option value="IMPORTANT">Важно</option>
                <option value="WARNING">Внимание</option>
              </select>
            </Field>
          </>
        )}

        {block.type === "CHECKLIST" && (
          <>
            <Field label="Заголовок (необязательно)"><TextInput value={(data.title as string) ?? ""} onChange={(e) => set({ title: e.target.value })} /></Field>
            <Field label="Пункты (по одному на строку)">
              <TextArea
                defaultValue={((data.items as { text: string }[]) ?? []).map((i) => i.text).join("\n")}
                onChange={(e) => set({ items: e.target.value.split("\n").map((t) => t.trim()).filter(Boolean).map((text) => ({ text })) })}
              />
            </Field>
          </>
        )}

        {block.type === "SUMMARY" && (
          <>
            <Field label="Заголовок (необязательно)"><TextInput value={(data.title as string) ?? ""} onChange={(e) => set({ title: e.target.value })} /></Field>
            <Field label="Пункты итогов (по одному на строку)">
              <TextArea
                defaultValue={((data.points as string[]) ?? []).join("\n")}
                onChange={(e) => set({ points: e.target.value.split("\n").map((t) => t.trim()).filter(Boolean) })}
              />
            </Field>
          </>
        )}
      </div>

      <button
        onClick={save}
        disabled={saving || disabled}
        className="mt-3 flex items-center gap-1.5 rounded-2xl bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:opacity-50"
      >
        <Save className="size-4" /> {saving ? "Сохранение…" : "Сохранить блок"}
      </button>
    </div>
  );
}
