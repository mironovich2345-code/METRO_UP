import type { Lesson } from "@/content/types";
import { DAY_1_LESSONS } from "./day-1";
import { DAY_2_LESSONS } from "./day-2";
import { DAY_3_LESSONS } from "./day-3";

export { DAY_1_LESSONS, DAY_2_LESSONS, DAY_3_LESSONS };

/** Every authored lesson, flattened. */
export const ALL_LESSONS: Lesson[] = [
  ...DAY_1_LESSONS,
  ...DAY_2_LESSONS,
  ...DAY_3_LESSONS,
];

const byId = new Map(ALL_LESSONS.map((l) => [l.id, l]));
const bySlug = new Map(ALL_LESSONS.map((l) => [l.slug, l]));

export function lessonById(id: string): Lesson | undefined {
  return byId.get(id);
}

export function lessonBySlug(slug: string): Lesson | undefined {
  return bySlug.get(slug);
}

export function lessonsByIds(ids: string[]): Lesson[] {
  return ids
    .map((id) => byId.get(id))
    .filter((l): l is Lesson => Boolean(l));
}
