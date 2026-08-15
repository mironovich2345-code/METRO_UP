"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { adminApi, type AdminProgramTree } from "@/lib/api/content-client";
import { ApiError } from "@/lib/api/client";
import { Field, TextInput, fieldCls } from "./ui";
import { Modal } from "@/components/control/Modal";
import { formatDayLabel } from "@/lib/learning-format";

/**
 * Guided "create lesson" flow: Программа → День → Раздел → Название → редактор.
 * No ids are ever shown. A new lesson is ALWAYS placed inside a day + section
 * (the "Без дня" path is intentionally not offered here). Missing day/section
 * can be created inline and are auto-selected — no need to leave the wizard.
 */
export function CreateLessonFlow({
  tree,
  onClose,
  onRefreshTree,
  initial,
}: {
  tree: AdminProgramTree[];
  onClose: () => void;
  onRefreshTree: () => Promise<AdminProgramTree[]>;
  initial?: { programId?: string; dayId?: string; courseId?: string };
}) {
  const router = useRouter();
  const [programs, setPrograms] = useState<AdminProgramTree[]>(tree);
  const [programId, setProgramId] = useState(initial?.programId ?? tree[0]?.id ?? "");
  const [dayId, setDayId] = useState(initial?.dayId ?? "");
  const [courseId, setCourseId] = useState(initial?.courseId ?? "");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newDay, setNewDay] = useState<string | null>(null); // draft title or null (hidden)
  const [newSection, setNewSection] = useState<string | null>(null);

  useEffect(() => setPrograms(tree), [tree]);

  const program = useMemo(() => programs.find((p) => p.id === programId), [programs, programId]);
  const days = useMemo(() => [...(program?.days ?? [])].sort((a, b) => a.dayNumber - b.dayNumber), [program]);
  const sections = useMemo(
    () => (program?.courses ?? []).filter((c) => c.trainingDayId === dayId),
    [program, dayId],
  );

  const refresh = async () => {
    const fresh = await onRefreshTree();
    setPrograms(fresh);
    return fresh;
  };

  const createDay = async () => {
    const t = (newDay ?? "").trim();
    if (!program || t.length < 2 || busy) return;
    setBusy(true); setError(null);
    try {
      const nextNumber = (days.at(-1)?.dayNumber ?? 0) + 1;
      const { day } = await adminApi.createDay({ programId, title: t, dayNumber: nextNumber });
      await refresh();
      setDayId(day.id);
      setCourseId("");
      setNewDay(null);
    } catch { setError("Не удалось создать день"); }
    finally { setBusy(false); }
  };

  const createSection = async () => {
    const t = (newSection ?? "").trim();
    if (!program || !dayId || t.length < 2 || busy) return;
    setBusy(true); setError(null);
    try {
      const { course } = await adminApi.createCourse({ programId, trainingDayId: dayId, title: t });
      await refresh();
      setCourseId(course.id);
      setNewSection(null);
    } catch { setError("Не удалось создать раздел"); }
    finally { setBusy(false); }
  };

  const create = async () => {
    if (!courseId || title.trim().length < 2 || busy) return;
    setBusy(true); setError(null);
    try {
      const { lesson } = await adminApi.createLesson({ courseId, title: title.trim() });
      onClose(); // unmount the modal first so its body-scroll lock releases cleanly
      router.push(`/admin/content/lessons/${lesson.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? "Не удалось создать урок" : "Ошибка");
      setBusy(false);
    }
  };

  const canCreate = Boolean(programId && dayId && courseId && title.trim().length >= 2);

  return (
    <Modal onClose={onClose} size="lg">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Создать урок</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-muted"><X className="size-4" /></button>
        </div>

        {programs.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            Сначала создайте программу обучения в разделе «Управление структурой».
          </p>
        ) : (
          <div className="mt-4 space-y-4">
            {/* Step 1 — program */}
            <Field label="Шаг 1. Программа обучения">
              <select className={fieldCls} value={programId} onChange={(e) => { setProgramId(e.target.value); setDayId(""); setCourseId(""); }}>
                {programs.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
            </Field>

            {/* Step 2 — day (required) */}
            <Field label="Шаг 2. День обучения">
              {days.length > 0 && newDay === null ? (
                <select className={fieldCls} value={dayId} onChange={(e) => { setDayId(e.target.value); setCourseId(""); }}>
                  <option value="">Выберите день…</option>
                  {days.map((d) => <option key={d.id} value={d.id}>{formatDayLabel(d.dayNumber, d.title)}</option>)}
                </select>
              ) : null}
              {newDay === null ? (
                <button type="button" onClick={() => setNewDay("")} className="mt-2 flex items-center gap-1 text-sm font-semibold text-brand hover:underline">
                  <Plus className="size-3.5" /> Создать новый день
                </button>
              ) : (
                <InlineNew
                  placeholder="Название дня, напр. «Знакомство с MetroFitness»"
                  value={newDay} onChange={setNewDay} onSubmit={createDay} onCancel={() => setNewDay(null)} busy={busy}
                />
              )}
              {days.length === 0 && newDay === null && (
                <p className="mt-1 text-xs text-muted-foreground">В программе пока нет дней. Создайте первый день, чтобы продолжить.</p>
              )}
            </Field>

            {/* Step 3 — section (requires a day) */}
            {dayId && (
              <Field label="Шаг 3. Раздел">
                {sections.length > 0 && newSection === null ? (
                  <select className={fieldCls} value={courseId} onChange={(e) => setCourseId(e.target.value)}>
                    <option value="">Выберите раздел…</option>
                    {sections.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                  </select>
                ) : null}
                {newSection === null ? (
                  <button type="button" onClick={() => setNewSection("")} className="mt-2 flex items-center gap-1 text-sm font-semibold text-brand hover:underline">
                    <Plus className="size-3.5" /> Создать новый раздел
                  </button>
                ) : (
                  <InlineNew
                    placeholder="Название раздела, напр. «Старт в Metro»"
                    value={newSection} onChange={setNewSection} onSubmit={createSection} onCancel={() => setNewSection(null)} busy={busy}
                  />
                )}
                {sections.length === 0 && newSection === null && (
                  <p className="mt-1 text-xs text-muted-foreground">В этом дне пока нет разделов. Создайте раздел, чтобы добавить в него урок.</p>
                )}
              </Field>
            )}

            {/* Step 4 — title */}
            {courseId && (
              <Field label="Шаг 4. Название урока">
                <TextInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Например: История MetroFitness" autoFocus />
              </Field>
            )}

            {error && <p className="text-sm text-red-500">{error}</p>}

            <button
              onClick={create}
              disabled={!canCreate || busy}
              className="mt-1 w-full rounded-2xl bg-brand px-5 py-2.5 text-sm font-semibold text-brand-foreground disabled:opacity-50"
            >
              {busy ? "Создаём…" : "Создать и открыть редактор"}
            </button>
          </div>
        )}
    </Modal>
  );
}

function InlineNew({
  placeholder, value, onChange, onSubmit, onCancel, busy,
}: {
  placeholder: string; value: string; onChange: (v: string) => void;
  onSubmit: () => void; onCancel: () => void; busy: boolean;
}) {
  return (
    <div className="mt-1 flex items-center gap-2">
      <input
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") onSubmit(); if (e.key === "Escape") onCancel(); }}
        placeholder={placeholder}
        className={fieldCls}
      />
      <button onClick={onSubmit} disabled={busy || value.trim().length < 2} className="shrink-0 rounded-2xl bg-brand px-3 py-2.5 text-sm font-semibold text-brand-foreground disabled:opacity-50">
        Создать
      </button>
      <button onClick={onCancel} className="shrink-0 rounded-2xl p-2 text-muted-foreground hover:bg-muted"><X className="size-4" /></button>
    </div>
  );
}
