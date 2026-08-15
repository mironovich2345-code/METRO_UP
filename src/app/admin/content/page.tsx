"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ChevronDown, ChevronRight, Plus, Settings2 } from "lucide-react";
import { adminApi, type AdminProgramTree } from "@/lib/api/content-client";
import { StatusBadge } from "@/components/admin/ui";
import { CreateLessonFlow } from "@/components/admin/CreateLessonFlow";
import { StructureManager } from "@/components/admin/StructureManager";
import { formatDayLabel, lessonsWord, daysWord, sectionsWord, minutesWord } from "@/lib/learning-format";

type Program = AdminProgramTree;
type Course = Program["courses"][number];
type WizardInit = { programId?: string; dayId?: string; courseId?: string } | null;

export default function ContentPage() {
  const [tree, setTree] = useState<Program[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [wizard, setWizard] = useState<WizardInit>(null); // null = closed
  const [showStructure, setShowStructure] = useState(false);

  const loadTree = useCallback(async (): Promise<Program[]> => {
    const { programs } = await adminApi.programs();
    setTree(programs);
    setError(null);
    setLoaded(true);
    return programs;
  }, []);

  useEffect(() => { void loadTree().catch(() => { setError("Нет доступа или сервер недоступен."); setLoaded(true); }); }, [loadTree]);

  const totals = useMemo(() => {
    const lessons = tree.flatMap((p) => p.courses.flatMap((c) => c.lessons));
    return {
      programs: tree.length,
      published: lessons.filter((l) => l.status === "PUBLISHED").length,
      draft: lessons.filter((l) => l.status === "DRAFT").length,
    };
  }, [tree]);

  // Unassigned sections across all programs — a structure problem, not a normal element.
  const unassigned = useMemo(
    () => tree.flatMap((p) => p.courses.filter((c) => !c.trainingDayId)),
    [tree],
  );

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Обучение</h1>
          <p className="mt-1 text-sm text-muted-foreground">Уроки, видео, материалы и тесты</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="mr-1 hidden gap-4 text-sm text-muted-foreground lg:flex">
            <span><b className="text-foreground">{totals.published}</b> опубл.</span>
            <span><b className="text-foreground">{totals.draft}</b> черновиков</span>
          </div>
          <button
            onClick={() => setWizard({})}
            className="flex h-11 items-center gap-1.5 rounded-2xl bg-brand px-5 text-sm font-semibold text-brand-foreground"
          >
            <Plus className="size-4" /> Создать урок
          </button>
        </div>
      </div>

      {error && <p className="mt-6 text-sm text-red-500">{error}</p>}

      {/* Unassigned sections warning (only when there is a real problem). */}
      {unassigned.length > 0 && (
        <button
          onClick={() => setShowStructure(true)}
          className="mt-5 flex w-full items-center gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-left"
        >
          <AlertTriangle className="size-5 shrink-0 text-amber-600 dark:text-amber-500" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">Не распределено</p>
            <p className="text-xs text-muted-foreground">
              {unassigned.length} {sectionsWord(unassigned.length)} без дня — назначьте день в управлении структурой.
            </p>
          </div>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
        </button>
      )}

      <div className="mt-6 space-y-5">
        {tree.map((program) => (
          <ProgramCard key={program.id} program={program} onCreateLesson={setWizard} />
        ))}
        {loaded && tree.length === 0 && !error && (
          <div className="rounded-3xl border border-dashed border-border bg-card/50 p-10 text-center">
            <p className="font-semibold">Пока нет программ обучения</p>
            <p className="mt-1 text-sm text-muted-foreground">Создайте программу, день и раздел в управлении структурой — затем добавляйте уроки.</p>
            <button onClick={() => setShowStructure(true)} className="mt-4 inline-flex items-center gap-1.5 rounded-2xl bg-brand px-4 py-2.5 text-sm font-semibold text-brand-foreground">
              <Settings2 className="size-4" /> Управление структурой
            </button>
          </div>
        )}
      </div>

      {/* Secondary action — structure management lives out of the main workspace. */}
      {tree.length > 0 && (
        <div className="mt-8 border-t border-border pt-5">
          <button
            onClick={() => setShowStructure(true)}
            className="flex items-center gap-2 rounded-2xl border border-border px-4 py-2.5 text-sm font-semibold text-muted-foreground hover:bg-muted"
          >
            <Settings2 className="size-4" /> Управление структурой
          </button>
        </div>
      )}

      {wizard !== null && (
        <CreateLessonFlow tree={tree} initial={wizard ?? undefined} onClose={() => setWizard(null)} onRefreshTree={loadTree} />
      )}
      {showStructure && (
        <StructureManager tree={tree} onClose={() => setShowStructure(false)} onRefreshTree={loadTree} />
      )}
    </div>
  );
}

function ProgramCard({ program, onCreateLesson }: { program: Program; onCreateLesson: (init: WizardInit) => void }) {
  const days = useMemo(() => [...program.days].sort((a, b) => a.dayNumber - b.dayNumber), [program.days]);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(days[0] ? [days[0].id] : []));
  const toggle = (id: string) => setExpanded((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const allLessons = program.courses.flatMap((c) => c.lessons);
  const published = allLessons.filter((l) => l.status === "PUBLISHED").length;
  const draft = allLessons.filter((l) => l.status === "DRAFT").length;

  return (
    <div className="rounded-3xl border border-border bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="min-w-0 truncate text-lg font-bold">{program.title}</h2>
        <StatusBadge status={program.status} />
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {days.length} {daysWord(days.length)} · {allLessons.length} {lessonsWord(allLessons.length)} · {published} опубликовано · {draft} черновиков
      </p>

      <div className="mt-4 space-y-2.5">
        {days.map((day) => {
          const sections = program.courses.filter((c) => c.trainingDayId === day.id).sort((a, b) => a.order - b.order);
          const dayLessons = sections.flatMap((c) => c.lessons);
          const minutes = dayLessons.reduce((s, l) => s + (l.durationMinutes || 0), 0);
          const isOpen = expanded.has(day.id);
          return (
            <div key={day.id} className="overflow-hidden rounded-2xl border border-border">
              <button onClick={() => toggle(day.id)} className="flex w-full items-center gap-3 bg-background px-4 py-3 text-left hover:bg-muted/50">
                <ChevronDown className={`size-4 shrink-0 text-muted-foreground transition-transform ${isOpen ? "" : "-rotate-90"}`} />
                <span className="min-w-0 flex-1 truncate font-semibold">{formatDayLabel(day.dayNumber, day.title)}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {dayLessons.length} {lessonsWord(dayLessons.length)}{minutes > 0 ? ` · ~${minutes} ${minutesWord(minutes)}` : ""}
                </span>
              </button>
              {isOpen && (
                <div className="space-y-4 border-t border-border px-4 py-4">
                  {sections.map((section) => (
                    <SectionBlock key={section.id} section={section} program={program} dayId={day.id} onCreateLesson={onCreateLesson} />
                  ))}
                  {sections.length === 0 && (
                    <div className="rounded-xl border border-dashed border-border p-4 text-center">
                      <p className="text-sm text-muted-foreground">В этом дне пока нет разделов.</p>
                      <button onClick={() => onCreateLesson({ programId: program.id, dayId: day.id })} className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-brand hover:underline">
                        <Plus className="size-3.5" /> Создать урок в этом дне
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {days.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border p-6 text-center">
            <p className="text-sm text-muted-foreground">В программе пока нет дней. Добавьте день и раздел в управлении структурой, затем создавайте уроки.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function SectionBlock({
  section, program, dayId, onCreateLesson,
}: {
  section: Course;
  program: Program;
  dayId: string;
  onCreateLesson: (init: WizardInit) => void;
}) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">{section.title}</p>
      <div className="space-y-1">
        {section.lessons.map((lesson) => (
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
        {section.lessons.length === 0 && (
          <div className="flex items-center justify-between gap-2 px-3 py-2">
            <p className="text-xs text-muted-foreground">В этом разделе пока нет уроков.</p>
            <button
              onClick={() => onCreateLesson({ programId: program.id, dayId, courseId: section.id })}
              className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-brand hover:underline"
            >
              <Plus className="size-3" /> Урок
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
