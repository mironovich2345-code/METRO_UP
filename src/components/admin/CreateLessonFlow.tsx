"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { adminApi, type AdminProgramTree } from "@/lib/api/content-client";
import { ApiError } from "@/lib/api/client";
import { Field, TextInput, fieldCls } from "./ui";

/**
 * Guided "create lesson" flow — pick program → day → course → title, then open
 * the editor. No UUID hunting. Reuses the existing admin content APIs.
 */
export function CreateLessonFlow({ tree, onClose }: { tree: AdminProgramTree[]; onClose: () => void }) {
  const router = useRouter();
  const [programId, setProgramId] = useState<string>(tree[0]?.id ?? "");
  const [dayId, setDayId] = useState<string>(""); // "" = без дня
  const [courseId, setCourseId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const program = useMemo(() => tree.find((p) => p.id === programId), [tree, programId]);
  const courses = useMemo(
    () => (program?.courses ?? []).filter((c) => (dayId ? c.trainingDayId === dayId : c.trainingDayId === null)),
    [program, dayId],
  );

  const create = async () => {
    if (!courseId || title.trim().length < 2) return;
    setBusy(true);
    setError(null);
    try {
      const { lesson } = await adminApi.createLesson({ courseId, title: title.trim() });
      router.push(`/admin/content/lessons/${lesson.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? "Не удалось создать урок" : "Ошибка");
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-3xl border border-border bg-card p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Создать урок</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-muted"><X className="size-4" /></button>
        </div>

        {tree.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            Сначала создайте программу, день и раздел на странице «Обучение».
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            <Field label="Программа">
              <select className={fieldCls} value={programId} onChange={(e) => { setProgramId(e.target.value); setDayId(""); setCourseId(""); }}>
                {tree.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
            </Field>

            <Field label="День">
              <select className={fieldCls} value={dayId} onChange={(e) => { setDayId(e.target.value); setCourseId(""); }}>
                <option value="">Без дня</option>
                {(program?.days ?? []).map((d) => <option key={d.id} value={d.id}>День {d.dayNumber}: {d.title}</option>)}
              </select>
            </Field>

            <Field label="Раздел (курс)">
              <select className={fieldCls} value={courseId} onChange={(e) => setCourseId(e.target.value)}>
                <option value="">Выберите раздел…</option>
                {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
              {courses.length === 0 && (
                <span className="mt-1 block text-xs text-muted-foreground">
                  В этом дне нет разделов — создайте раздел на странице «Обучение».
                </span>
              )}
            </Field>

            <Field label="Название урока">
              <TextInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Например: Как устроено обучение" />
            </Field>

            {error && <p className="text-sm text-red-500">{error}</p>}

            <button
              onClick={create}
              disabled={busy || !courseId || title.trim().length < 2}
              className="mt-2 w-full rounded-2xl bg-brand px-5 py-2.5 text-sm font-semibold text-brand-foreground disabled:opacity-50"
            >
              {busy ? "Создаём…" : "Создать и открыть редактор"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
