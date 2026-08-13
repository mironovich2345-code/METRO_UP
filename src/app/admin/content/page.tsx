"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Archive, ChevronRight, FolderTree, Plus, Settings2 } from "lucide-react";
import { adminApi, type AdminDashboard, type AdminProgramTree } from "@/lib/api/content-client";
import { InlineCreate, StatusBadge, fieldCls } from "@/components/admin/ui";
import { CreateLessonFlow } from "@/components/admin/CreateLessonFlow";

type Course = AdminProgramTree["courses"][number];

export default function ContentPage() {
  const [tree, setTree] = useState<AdminProgramTree[]>([]);
  const [totals, setTotals] = useState<AdminDashboard["totals"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [{ programs }, dash] = await Promise.all([adminApi.programs(), adminApi.dashboard()]);
      setTree(programs);
      setTotals(dash.totals);
      setError(null);
    } catch {
      setError("Нет доступа или сервер недоступен.");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div>
      {/* Primary scenario: create a lesson. */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Обучение</h1>
          <p className="mt-1 text-sm text-muted-foreground">Уроки, видео, материалы и тесты</p>
        </div>
        <div className="flex items-center gap-4">
          {totals && (
            <div className="hidden gap-4 text-sm text-muted-foreground lg:flex">
              <span><b className="text-foreground">{totals.programs}</b> программ</span>
              <span><b className="text-foreground">{totals.lessonsPublished}</b> опубликовано</span>
              <span><b className="text-foreground">{totals.lessonsDraft}</b> черновиков</span>
            </div>
          )}
          <button
            onClick={() => setShowCreate(true)}
            className="flex h-11 items-center gap-1.5 rounded-2xl bg-brand px-5 text-sm font-semibold text-brand-foreground"
          >
            <Plus className="size-4" /> Создать урок
          </button>
        </div>
      </div>

      {showCreate && <CreateLessonFlow tree={tree} onClose={() => setShowCreate(false)} />}

      {error && <p className="mt-6 text-sm text-red-500">{error}</p>}

      {/* Content hierarchy — read-focused. */}
      <div className="mt-6 space-y-5">
        {tree.map((program) => (
          <ProgramCard key={program.id} program={program} onChanged={refresh} />
        ))}
        {tree.length === 0 && !error && (
          <div className="rounded-3xl border border-dashed border-border bg-card/50 p-10 text-center">
            <p className="font-semibold">Пока нет программ обучения</p>
            <p className="mt-1 text-sm text-muted-foreground">Создайте программу ниже, затем добавьте день, раздел и урок.</p>
          </div>
        )}
      </div>

      {/* Secondary: structure management (create a new program). */}
      <div className="mt-10 border-t border-border pt-6">
        <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Settings2 className="size-3.5" /> Управление структурой
        </p>
        <div className="max-w-md">
          <InlineCreate
            placeholder="Название новой программы"
            cta="Программа"
            onCreate={async (title) => {
              await adminApi.createProgram(title);
              await refresh();
            }}
          />
        </div>
      </div>
    </div>
  );
}

function ProgramCard({ program, onChanged }: { program: AdminProgramTree; onChanged: () => Promise<void> }) {
  const [manage, setManage] = useState(false);
  const nextDayNumber = (program.days.at(-1)?.dayNumber ?? 0) + 1;
  const looseCourses = program.courses.filter((c) => !c.trainingDayId);
  const totalLessons = program.courses.reduce((s, c) => s + c.lessons.length, 0);

  return (
    <div className="rounded-3xl border border-border bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <FolderTree className="size-5 shrink-0 text-brand" />
          <h2 className="truncate text-lg font-bold">{program.title}</h2>
          <StatusBadge status={program.status} />
          <span className="hidden text-xs text-muted-foreground sm:inline">
            · {program.days.length} дн. · {totalLessons} уроков
          </span>
        </div>
        <button
          onClick={() => setManage((m) => !m)}
          className={`flex h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition-colors ${manage ? "border-brand/40 bg-brand/10 text-foreground" : "border-border text-muted-foreground hover:bg-muted"}`}
        >
          <Settings2 className="size-3.5" /> {manage ? "Готово" : "Структура"}
        </button>
      </div>

      {/* Hierarchy grouped by training day. */}
      <div className="mt-4 space-y-4">
        {program.days.map((day) => (
          <DaySection
            key={day.id}
            label={`День ${day.dayNumber} · ${day.title}`}
            courses={program.courses.filter((c) => c.trainingDayId === day.id)}
            manage={manage}
            program={program}
            onChanged={onChanged}
          />
        ))}
        <DaySection
          label="Без дня"
          courses={looseCourses}
          manage={manage}
          program={program}
          onChanged={onChanged}
          hideWhenEmpty
        />
        {program.courses.length === 0 && (
          <p className="text-sm text-muted-foreground">Пока нет разделов и уроков — включите «Структуру», чтобы добавить.</p>
        )}
      </div>

      {/* Management controls (secondary, revealed on demand). */}
      {manage && (
        <div className="mt-5 grid gap-3 rounded-2xl border border-border bg-background p-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Новый день (№{nextDayNumber})</span>
            <InlineCreate
              placeholder={`Название дня ${nextDayNumber}`}
              cta="День"
              onCreate={async (title) => {
                await adminApi.createDay({ programId: program.id, title, dayNumber: nextDayNumber });
                await onChanged();
              }}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Новый раздел (курс)</span>
            <InlineCreate
              placeholder="Название раздела"
              cta="Раздел"
              onCreate={async (title) => {
                await adminApi.createCourse({ programId: program.id, title });
                await onChanged();
              }}
            />
          </label>
          {program.status !== "ARCHIVED" && (
            <button
              onClick={async () => {
                if (!confirm("Архивировать программу? Контент не удаляется.")) return;
                await adminApi.archiveProgram(program.id);
                await onChanged();
              }}
              className="flex h-11 items-center justify-center gap-1.5 rounded-2xl border border-border px-4 text-sm font-medium text-muted-foreground hover:bg-muted sm:col-span-2 sm:w-fit"
            >
              <Archive className="size-4" /> Архивировать программу
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function DaySection({
  label,
  courses,
  manage,
  program,
  onChanged,
  hideWhenEmpty,
}: {
  label: string;
  courses: Course[];
  manage: boolean;
  program: AdminProgramTree;
  onChanged: () => Promise<void>;
  hideWhenEmpty?: boolean;
}) {
  if (hideWhenEmpty && courses.length === 0) return null;
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="space-y-3">
        {courses.map((course) => (
          <div key={course.id} className="rounded-2xl border border-border bg-background p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="min-w-0 truncate font-semibold">{course.title}</p>
              {manage && (
                <select
                  className={fieldCls + " h-9 w-auto py-0"}
                  value={course.trainingDayId ?? ""}
                  onChange={async (e) => {
                    await adminApi.updateCourse(course.id, { trainingDayId: e.target.value || null });
                    await onChanged();
                  }}
                >
                  <option value="">Без дня</option>
                  {program.days.map((d) => (
                    <option key={d.id} value={d.id}>День {d.dayNumber}: {d.title}</option>
                  ))}
                </select>
              )}
            </div>
            <div className="mt-3 space-y-1">
              {course.lessons.map((lesson) => (
                <Link
                  key={lesson.id}
                  href={`/admin/content/lessons/${lesson.id}`}
                  className="flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm hover:bg-muted"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate">{lesson.title}</span>
                    {lesson.isRequired && <span className="shrink-0 text-xs text-muted-foreground">обяз.</span>}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <StatusBadge status={lesson.status} />
                    <ChevronRight className="size-4 text-muted-foreground" />
                  </span>
                </Link>
              ))}
              {course.lessons.length === 0 && <p className="px-3 text-xs text-muted-foreground">Нет уроков</p>}
            </div>
            {manage && (
              <div className="mt-3 max-w-sm">
                <InlineCreate
                  placeholder="Название урока"
                  cta="Урок"
                  onCreate={async (title) => {
                    await adminApi.createLesson({ courseId: course.id, title });
                    await onChanged();
                  }}
                />
              </div>
            )}
          </div>
        ))}
        {courses.length === 0 && !hideWhenEmpty && (
          <p className="text-xs text-muted-foreground">Нет разделов в этом дне</p>
        )}
      </div>
    </div>
  );
}
