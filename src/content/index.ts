/**
 * Public content API for Metro UP.
 * UI imports everything training-related from here.
 */
import type { Achievement } from "@/content/types";

export * from "@/content/types";

export {
  PROGRAMS,
  ADAPTATION_PROGRAM,
  ADVANCED_COURSES,
  programBySlug,
  findDay,
  courseBySlug,
} from "@/content/programs";

export {
  ALL_LESSONS,
  DAY_1_LESSONS,
  DAY_2_LESSONS,
  DAY_3_LESSONS,
  lessonById,
  lessonBySlug,
  lessonsByIds,
} from "@/content/lessons";

export { QUIZZES, quizById } from "@/content/quizzes";
export { EQUIPMENT, equipmentById } from "@/content/equipment";
export { GROUP_CLASSES, groupClassById } from "@/content/group-classes";
export { CITIES, cityById } from "@/content/cities";
export { CLUBS, clubsForCity, clubById } from "@/content/clubs";

export {
  COMPLETED_LESSON_IDS,
  isLessonCompleted,
  STATE_LABELS,
  ADVANCED_LOCK_REASON,
  dayLessonViews,
  dayProgress,
  programProgress,
  courseState,
  type LessonView,
  type DayProgress,
} from "@/content/progress";

/** Placeholder achievements tied to the adaptation program. */
export const TRAINING_ACHIEVEMENTS: Achievement[] = [
  {
    id: "ach-first-day",
    slug: "first-day",
    title: "Первый день",
    description: "Завершён первый день адаптации",
    icon: "Sparkles",
    xpReward: 50,
  },
  {
    id: "ach-adaptation-complete",
    slug: "adaptation-complete",
    title: "Адаптация пройдена",
    description: "Завершены все три дня и аттестация",
    icon: "Award",
    xpReward: 200,
  },
];
