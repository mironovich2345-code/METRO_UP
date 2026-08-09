/**
 * Pure gating logic (no DB, no server-only) so it is directly unit-testable.
 * The DB-backed wrappers live in ./gating.
 */

export interface SequenceLesson {
  id: string;
  slug: string;
  title: string;
  isRequired: boolean;
  dayNumber: number;
  courseOrder: number;
  lessonOrder: number;
}

export interface Access {
  locked: boolean;
  reason: string | null;
}

/**
 * Access for the lesson at `index` in the ordered sequence, given the set of
 * completed lesson ids. Locked when any PRIOR REQUIRED lesson is not completed.
 */
export function accessAt(
  sequence: SequenceLesson[],
  index: number,
  completed: Set<string>,
): Access {
  if (index < 0) return { locked: true, reason: "Урок недоступен" };
  const current = sequence[index];
  for (let i = 0; i < index; i++) {
    const prev = sequence[i];
    if (prev.isRequired && !completed.has(prev.id)) {
      const reason =
        prev.dayNumber < current.dayNumber
          ? "Этот день откроется после завершения предыдущего"
          : "Сначала завершите предыдущий урок";
      return { locked: true, reason };
    }
  }
  return { locked: false, reason: null };
}
