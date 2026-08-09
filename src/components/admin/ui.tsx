"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export const fieldCls =
  "w-full rounded-2xl border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none focus:border-brand";

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(fieldCls, props.className)} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn(fieldCls, "min-h-24 resize-y", props.className)} />;
}

/** Small "type a title + press add" inline creator. */
export function InlineCreate({
  placeholder,
  cta = "Добавить",
  onCreate,
}: {
  placeholder: string;
  cta?: string;
  onCreate: (value: string) => Promise<void> | void;
}) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (value.trim().length < 2 || busy) return;
    setBusy(true);
    try {
      await onCreate(value.trim());
      setValue("");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex items-center gap-2">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder={placeholder}
        className={fieldCls}
      />
      <button
        onClick={submit}
        disabled={busy || value.trim().length < 2}
        className="flex shrink-0 items-center gap-1 rounded-2xl bg-brand px-3 py-2.5 text-sm font-semibold text-brand-foreground disabled:opacity-50"
      >
        <Plus className="size-4" /> {cta}
      </button>
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    PUBLISHED: "bg-success-soft text-success",
    DRAFT: "bg-muted text-muted-foreground",
    ARCHIVED: "bg-foreground/10 text-muted-foreground",
  };
  const label: Record<string, string> = { PUBLISHED: "Опубликован", DRAFT: "Черновик", ARCHIVED: "В архиве" };
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", map[status] ?? "bg-muted")}>
      {label[status] ?? status}
    </span>
  );
}
