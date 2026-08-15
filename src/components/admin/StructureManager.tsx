"use client";

import { useEffect, useMemo, useState } from "react";
import { Archive, ChevronDown, ChevronUp, FolderTree, X } from "lucide-react";
import { adminApi, type AdminProgramTree } from "@/lib/api/content-client";
import { InlineCreate, StatusBadge, fieldCls } from "./ui";
import { formatDayLabel, dayNeedsTitle, daysWord, sectionsWord } from "@/lib/learning-format";

/**
 * Structure management — the ONLY place the technical hierarchy is edited, kept
 * out of the main "create lesson" workspace. Create/rename programs, days and
 * sections; assign a section to a day; reorder; archive. No destructive delete
 * (none exists in the API), and no production data is changed automatically.
 */
export function StructureManager({
  tree,
  onClose,
  onRefreshTree,
}: {
  tree: AdminProgramTree[];
  onClose: () => void;
  onRefreshTree: () => Promise<AdminProgramTree[]>;
}) {
  const [programs, setPrograms] = useState<AdminProgramTree[]>(tree);
  const [busy, setBusy] = useState(false);
  useEffect(() => setPrograms(tree), [tree]);

  const refresh = async () => setPrograms(await onRefreshTree());
  const run = async (fn: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    try { await fn(); await refresh(); } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4" onClick={onClose}>
      <div className="my-8 w-full max-w-2xl rounded-3xl border border-border bg-card p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-bold"><FolderTree className="size-5 text-brand" /> Управление структурой</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-muted"><X className="size-4" /></button>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">Программы, дни и разделы. Уроки создаются отдельной кнопкой «Создать урок».</p>

        <div className="mt-5 space-y-5">
          {programs.map((program) => (
            <ProgramBlock key={program.id} program={program} busy={busy} run={run} />
          ))}
          {programs.length === 0 && (
            <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Пока нет программ обучения. Создайте первую программу ниже.
            </p>
          )}
        </div>

        <div className="mt-6 border-t border-border pt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Новая программа</p>
          <div className="max-w-md">
            <InlineCreate placeholder="Название программы" cta="Программа" onCreate={(t) => run(() => adminApi.createProgram(t))} />
          </div>
        </div>
      </div>
    </div>
  );
}

function ProgramBlock({ program, busy, run }: { program: AdminProgramTree; busy: boolean; run: (fn: () => Promise<unknown>) => Promise<void> }) {
  const [open, setOpen] = useState(true);
  const days = useMemo(() => [...program.days].sort((a, b) => a.dayNumber - b.dayNumber), [program.days]);
  const courses = useMemo(() => [...program.courses].sort((a, b) => a.order - b.order), [program.courses]);
  const nextDayNumber = (days.at(-1)?.dayNumber ?? 0) + 1;

  const swapDayNumbers = (a: typeof days[number], b: typeof days[number]) =>
    run(async () => {
      // Safe swap around the @@unique([programId, dayNumber]) constraint.
      const temp = 100000 + a.dayNumber;
      await adminApi.updateDay(a.id, { dayNumber: temp });
      await adminApi.updateDay(b.id, { dayNumber: a.dayNumber });
      await adminApi.updateDay(a.id, { dayNumber: b.dayNumber });
    });
  const swapCourseOrders = (a: typeof courses[number], b: typeof courses[number]) =>
    run(async () => {
      await adminApi.updateCourse(a.id, { order: b.order });
      await adminApi.updateCourse(b.id, { order: a.order });
    });

  return (
    <div className="rounded-2xl border border-border bg-background p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button onClick={() => setOpen((o) => !o)} className="flex min-w-0 items-center gap-2">
          {open ? <ChevronUp className="size-4 shrink-0 text-muted-foreground" /> : <ChevronDown className="size-4 shrink-0 text-muted-foreground" />}
          <span className="truncate font-bold">{program.title}</span>
          <StatusBadge status={program.status} />
        </button>
        <span className="text-xs text-muted-foreground">{days.length} {daysWord(days.length)} · {courses.length} {sectionsWord(courses.length)}</span>
      </div>

      {open && (
        <div className="mt-4 space-y-5">
          <InlineRename label="Название программы" value={program.title} disabled={busy} onSave={(t) => run(() => adminApi.updateProgram(program.id, { title: t }))} />

          {/* Days */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Дни</p>
            <div className="space-y-2">
              {days.map((d, i) => (
                <div key={d.id} className="flex items-center gap-2">
                  <div className="flex shrink-0 flex-col">
                    <button disabled={busy || i === 0} onClick={() => swapDayNumbers(d, days[i - 1])} className="text-muted-foreground hover:text-foreground disabled:opacity-30"><ChevronUp className="size-4" /></button>
                    <button disabled={busy || i === days.length - 1} onClick={() => swapDayNumbers(d, days[i + 1])} className="text-muted-foreground hover:text-foreground disabled:opacity-30"><ChevronDown className="size-4" /></button>
                  </div>
                  <span className="w-14 shrink-0 text-sm font-semibold text-muted-foreground">День {d.dayNumber}</span>
                  <div className="min-w-0 flex-1">
                    <InlineRename
                      value={d.title}
                      disabled={busy}
                      placeholder="Название дня"
                      warn={dayNeedsTitle(d.dayNumber, d.title)}
                      onSave={(t) => run(() => adminApi.updateDay(d.id, { title: t }))}
                    />
                  </div>
                </div>
              ))}
              {days.length === 0 && <p className="text-xs text-muted-foreground">Пока нет дней.</p>}
            </div>
            <div className="mt-2 max-w-sm">
              <InlineCreate placeholder={`Название дня ${nextDayNumber}`} cta="День" onCreate={(t) => run(() => adminApi.createDay({ programId: program.id, title: t, dayNumber: nextDayNumber }))} />
            </div>
          </div>

          {/* Sections */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Разделы</p>
            <div className="space-y-2">
              {courses.map((c, i) => (
                <div key={c.id} className="flex items-center gap-2">
                  <div className="flex shrink-0 flex-col">
                    <button disabled={busy || i === 0} onClick={() => swapCourseOrders(c, courses[i - 1])} className="text-muted-foreground hover:text-foreground disabled:opacity-30"><ChevronUp className="size-4" /></button>
                    <button disabled={busy || i === courses.length - 1} onClick={() => swapCourseOrders(c, courses[i + 1])} className="text-muted-foreground hover:text-foreground disabled:opacity-30"><ChevronDown className="size-4" /></button>
                  </div>
                  <div className="min-w-0 flex-1">
                    <InlineRename value={c.title} disabled={busy} placeholder="Название раздела" onSave={(t) => run(() => adminApi.updateCourse(c.id, { title: t }))} />
                  </div>
                  <select
                    className={`${fieldCls} h-9 w-auto shrink-0 py-0 text-sm ${!c.trainingDayId ? "border-amber-500/50" : ""}`}
                    value={c.trainingDayId ?? ""}
                    disabled={busy}
                    onChange={(e) => run(() => adminApi.updateCourse(c.id, { trainingDayId: e.target.value || null }))}
                  >
                    <option value="">⚠ Не распределён</option>
                    {days.map((d) => <option key={d.id} value={d.id}>{formatDayLabel(d.dayNumber, d.title)}</option>)}
                  </select>
                </div>
              ))}
              {courses.length === 0 && <p className="text-xs text-muted-foreground">Пока нет разделов.</p>}
            </div>
            <div className="mt-2 max-w-sm">
              <InlineCreate placeholder="Название раздела" cta="Раздел" onCreate={(t) => run(() => adminApi.createCourse({ programId: program.id, title: t, trainingDayId: days[0]?.id ?? null }))} />
            </div>
          </div>

          {program.status !== "ARCHIVED" && (
            <button
              onClick={() => { if (confirm("Архивировать программу? Контент не удаляется.")) run(() => adminApi.archiveProgram(program.id)); }}
              className="flex items-center gap-1.5 rounded-2xl border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted"
            >
              <Archive className="size-4" /> Архивировать программу
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function InlineRename({
  value, onSave, label, placeholder, disabled, warn,
}: {
  value: string;
  onSave: (title: string) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  warn?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const changed = draft.trim() !== value.trim() && draft.trim().length >= 2;
  return (
    <label className="block">
      {label && <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>}
      <div className="flex items-center gap-2">
        <input
          value={draft}
          disabled={disabled}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && changed) onSave(draft.trim()); }}
          placeholder={placeholder}
          className={`${fieldCls} ${warn ? "border-amber-500/50" : ""}`}
        />
        {changed && (
          <button onClick={() => onSave(draft.trim())} disabled={disabled} className="shrink-0 rounded-2xl bg-foreground px-3 py-2.5 text-sm font-semibold text-background disabled:opacity-50">
            Сохранить
          </button>
        )}
      </div>
      {warn && !changed && <span className="mt-1 block text-xs text-amber-600 dark:text-amber-500">Задайте понятное название дня</span>}
    </label>
  );
}
