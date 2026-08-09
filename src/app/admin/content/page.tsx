"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Archive, CalendarDays, ChevronRight, FolderTree } from "lucide-react";
import { adminApi, type AdminDashboard, type AdminProgramTree } from "@/lib/api/content-client";
import { InlineCreate, StatusBadge } from "@/components/admin/ui";

export default function ContentPage() {
  const [tree, setTree] = useState<AdminProgramTree[]>([]);
  const [totals, setTotals] = useState<AdminDashboard["totals"] | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Обучение</h1>
          <p className="mt-1 text-sm text-muted-foreground">Программы, курсы, уроки и медиа</p>
        </div>
        {totals && (
          <div className="flex gap-4 text-sm">
            <span><b>{totals.programs}</b> программ</span>
            <span><b>{totals.lessonsPublished}</b> опубликовано</span>
            <span><b>{totals.lessonsDraft}</b> черновиков</span>
          </div>
        )}
      </div>

      {error && <p className="mt-6 text-sm text-red-500">{error}</p>}

      <div className="mt-6 max-w-md">
        <InlineCreate
          placeholder="Название новой программы"
          cta="Создать программу"
          onCreate={async (title) => {
            await adminApi.createProgram(title);
            await refresh();
          }}
        />
      </div>

      <div className="mt-8 space-y-6">
        {tree.map((program) => (
          <ProgramCard key={program.id} program={program} onChanged={refresh} />
        ))}
        {tree.length === 0 && !error && (
          <p className="text-sm text-muted-foreground">Пока нет программ. Создайте первую выше.</p>
        )}
      </div>
    </div>
  );
}

function ProgramCard({ program, onChanged }: { program: AdminProgramTree; onChanged: () => Promise<void> }) {
  const nextDayNumber = (program.days.at(-1)?.dayNumber ?? 0) + 1;
  return (
    <div className="rounded-3xl border border-border bg-card p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <FolderTree className="size-5 text-brand" />
          <h2 className="text-lg font-bold">{program.title}</h2>
          <StatusBadge status={program.status} />
        </div>
        {program.status !== "ARCHIVED" && (
          <button
            onClick={async () => {
              if (!confirm("Архивировать программу? Контент не удаляется.")) return;
              await adminApi.archiveProgram(program.id);
              await onChanged();
            }}
            className="flex items-center gap-1 rounded-xl px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
          >
            <Archive className="size-3.5" /> В архив
          </button>
        )}
      </div>

      {/* Days */}
      <div className="mt-4">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <CalendarDays className="size-3.5" /> Дни адаптации
        </p>
        <div className="mb-2 flex flex-wrap gap-2">
          {program.days.map((d) => (
            <span key={d.id} className="rounded-full bg-muted px-3 py-1 text-xs">
              День {d.dayNumber}: {d.title}
            </span>
          ))}
          {program.days.length === 0 && <span className="text-xs text-muted-foreground">Дни ещё не заданы</span>}
        </div>
        <div className="max-w-sm">
          <InlineCreate
            placeholder={`Название дня ${nextDayNumber}`}
            cta="День"
            onCreate={async (title) => {
              await adminApi.createDay({ programId: program.id, title, dayNumber: nextDayNumber });
              await onChanged();
            }}
          />
        </div>
      </div>

      {/* Courses + lessons */}
      <div className="mt-5 space-y-4">
        {program.courses.map((course) => (
          <div key={course.id} className="rounded-2xl border border-border bg-background p-4">
            <p className="font-semibold">{course.title}</p>
            <div className="mt-3 space-y-1.5">
              {course.lessons.map((lesson) => (
                <Link
                  key={lesson.id}
                  href={`/admin/content/lessons/${lesson.id}`}
                  className="flex items-center justify-between rounded-xl px-3 py-2 text-sm hover:bg-muted"
                >
                  <span className="flex items-center gap-2">
                    {lesson.title}
                    {lesson.isRequired && <span className="text-xs text-muted-foreground">обяз.</span>}
                  </span>
                  <span className="flex items-center gap-2">
                    <StatusBadge status={lesson.status} />
                    <ChevronRight className="size-4 text-muted-foreground" />
                  </span>
                </Link>
              ))}
              {course.lessons.length === 0 && (
                <p className="px-3 text-xs text-muted-foreground">Нет уроков</p>
              )}
            </div>
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
          </div>
        ))}
      </div>

      <div className="mt-4 max-w-sm">
        <InlineCreate
          placeholder="Название курса"
          cta="Курс"
          onCreate={async (title) => {
            await adminApi.createCourse({ programId: program.id, title });
            await onChanged();
          }}
        />
      </div>
    </div>
  );
}
