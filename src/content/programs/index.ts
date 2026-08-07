import type { Course, TrainingDay, TrainingProgram } from "@/content/types";
import { ADAPTATION_PROGRAM } from "./adaptation";
import { ADVANCED_COURSES } from "./advanced";

export { ADAPTATION_PROGRAM, ADVANCED_COURSES };

export const PROGRAMS: TrainingProgram[] = [ADAPTATION_PROGRAM];

export function programBySlug(slug: string): TrainingProgram | undefined {
  return PROGRAMS.find((p) => p.slug === slug);
}

/** Find a training day by slug or id across all programs. */
export function findDay(slugOrId: string): TrainingDay | undefined {
  for (const program of PROGRAMS) {
    const day = program.days.find(
      (d) => d.slug === slugOrId || d.id === slugOrId,
    );
    if (day) return day;
  }
  return undefined;
}

export function courseBySlug(slug: string): Course | undefined {
  return ADVANCED_COURSES.find((c) => c.slug === slug || c.id === slug);
}
