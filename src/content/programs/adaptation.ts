import type { Lesson, TrainingProgram } from "@/content/types";
import {
  DAY_1_LESSONS,
  DAY_2_LESSONS,
  DAY_3_LESSONS,
} from "@/content/lessons";

const minutes = (lessons: Lesson[]) =>
  lessons.reduce((sum, l) => sum + l.durationMinutes, 0);

/** Three-day base adaptation available to every новичок. */
export const ADAPTATION_PROGRAM: TrainingProgram = {
  id: "prog-adaptation",
  slug: "adaptation",
  title: "Базовая адаптация",
  description: "Три дня знакомства с Metro, продуктом и стандартами работы.",
  icon: "GraduationCap",
  accessLevel: "onboarding",
  order: 1,
  status: "PUBLISHED",
  days: [
    {
      id: "day-1",
      slug: "day-1",
      title: "Знакомство с Metro",
      subtitle: "День 1",
      icon: "Sparkles",
      order: 1,
      estimatedMinutes: minutes(DAY_1_LESSONS),
      lessonIds: DAY_1_LESSONS.map((l) => l.id),
    },
    {
      id: "day-2",
      slug: "day-2",
      title: "Знание продукта",
      subtitle: "День 2",
      icon: "Dumbbell",
      order: 2,
      estimatedMinutes: minutes(DAY_2_LESSONS),
      lessonIds: DAY_2_LESSONS.map((l) => l.id),
    },
    {
      id: "day-3",
      slug: "day-3",
      title: "Стандарты работы",
      subtitle: "День 3",
      icon: "ShieldCheck",
      order: 3,
      estimatedMinutes: minutes(DAY_3_LESSONS),
      lessonIds: DAY_3_LESSONS.map((l) => l.id),
    },
  ],
};
