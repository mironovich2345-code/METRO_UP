import type { GroupClass } from "@/content/types";

/** Placeholder group-class catalogue referenced by GROUP_CLASS_CARD blocks. */
export const GROUP_CLASSES: GroupClass[] = [
  {
    id: "gc-cycle",
    slug: "cycle",
    name: "Metro Cycle",
    intensity: "high",
    durationMinutes: 45,
    summary: "Интервальная сайкл-тренировка под музыку.",
    icon: "Bike",
  },
  {
    id: "gc-yoga",
    slug: "yoga",
    name: "Metro Yoga",
    intensity: "low",
    durationMinutes: 60,
    summary: "Мягкая практика на гибкость и восстановление.",
    icon: "Flower2",
  },
  {
    id: "gc-hiit",
    slug: "hiit",
    name: "Metro HIIT",
    intensity: "high",
    durationMinutes: 30,
    summary: "Высокоинтенсивный функциональный тренинг.",
    icon: "Flame",
  },
  {
    id: "gc-stretch",
    slug: "stretch",
    name: "Metro Stretch",
    intensity: "low",
    durationMinutes: 45,
    summary: "Растяжка и мобилити для всех уровней.",
    icon: "StretchHorizontal",
  },
];

export function groupClassById(id: string): GroupClass | undefined {
  return GROUP_CLASSES.find((g) => g.id === id);
}
