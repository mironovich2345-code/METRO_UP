import type {
  ContentState,
  Course,
  Lesson,
  TrainingDay,
  TrainingProgram,
} from "@/content/types";
import { ALL_LESSONS, lessonsByIds } from "@/content/lessons";

/**
 * Demo progress snapshot. There is no backend yet, so completion is a static
 * placeholder set of lesson ids. When a real progress store lands, only this
 * module changes — the UI already reads through the helpers below.
 *
 * Snapshot: fresh новичок — базовая адаптация ещё не начата (0%).
 */
export const COMPLETED_LESSON_IDS: ReadonlySet<string> = new Set<string>([]);

export function isLessonCompleted(id: string): boolean {
  return COMPLETED_LESSON_IDS.has(id);
}

/** Human-readable Russian label for each runtime state. */
export const STATE_LABELS: Record<ContentState, string> = {
  available: "Доступно",
  completed: "Завершено",
  locked: "Заблокировано",
  awaiting_attestation: "Ожидает аттестации",
  awaiting_approval: "Ожидает одобрения управляющего",
};

/** Explanation shown on the locked part of the Academy. */
export const ADVANCED_LOCK_REASON =
  "Доступ откроется после аттестации и подтверждения управляющим";

export interface LessonView {
  lesson: Lesson;
  state: ContentState;
}

/**
 * Resolve per-lesson state within a day. Lessons unlock sequentially; the next
 * lesson is `available`, unless it is the final attestation, which surfaces as
 * `awaiting_attestation`. A completed attestation makes it `awaiting_approval`.
 */
export function dayLessonViews(day: TrainingDay): LessonView[] {
  const lessons = lessonsByIds(day.lessonIds);
  const firstIncomplete = lessons.findIndex(
    (l) => !COMPLETED_LESSON_IDS.has(l.id),
  );

  return lessons.map((lesson, i) => {
    const completed = COMPLETED_LESSON_IDS.has(lesson.id);
    const isAttestation = Boolean(lesson.quiz?.isAttestation);

    let state: ContentState;
    if (completed) {
      state = isAttestation ? "awaiting_approval" : "completed";
    } else if (firstIncomplete !== -1 && i === firstIncomplete) {
      state = isAttestation ? "awaiting_attestation" : "available";
    } else {
      state = "locked";
    }
    return { lesson, state };
  });
}

export interface DayProgress {
  completed: number;
  total: number;
  ratio: number;
  state: ContentState;
}

export function dayProgress(day: TrainingDay): DayProgress {
  const lessons = lessonsByIds(day.lessonIds);
  const total = lessons.length;
  const completed = lessons.filter((l) =>
    COMPLETED_LESSON_IDS.has(l.id),
  ).length;
  const ratio = total ? completed / total : 0;
  // Base days are always accessible to a новичок (never locked between days).
  const state: ContentState =
    completed >= total ? "completed" : "available";
  return { completed, total, ratio, state };
}

export function programProgress(program: TrainingProgram): {
  completed: number;
  total: number;
  ratio: number;
  state: ContentState;
} {
  const dayStats = program.days.map(dayProgress);
  const completed = dayStats.reduce((s, d) => s + d.completed, 0);
  const total = dayStats.reduce((s, d) => s + d.total, 0);
  const ratio = total ? completed / total : 0;

  // Program-level attestation gate.
  const attestationLesson = ALL_LESSONS.find((l) => l.quiz?.isAttestation);
  let state: ContentState = "available";
  if (attestationLesson) {
    const done = COMPLETED_LESSON_IDS.has(attestationLesson.id);
    const readyForAttestation = program.days.every(
      (d) =>
        dayProgress(d).state === "completed" ||
        lessonsByIds(d.lessonIds).every(
          (l) => COMPLETED_LESSON_IDS.has(l.id) || l.quiz?.isAttestation,
        ),
    );
    if (done) state = "awaiting_approval";
    else if (readyForAttestation) state = "awaiting_attestation";
  }
  return { completed, total, ratio, state };
}

/** Advanced tracks are locked for новичок until attestation + approval. */
export function courseState(course: Course): ContentState {
  return course.accessLevel === "onboarding" ? "available" : "locked";
}
