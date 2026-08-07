import type { Course } from "@/content/types";

/**
 * The wider Academy that unlocks only after attestation and manager approval.
 * These tracks are authored later — here they exist as locked previews.
 */
export const ADVANCED_COURSES: Course[] = [
  {
    id: "course-sales",
    slug: "sales",
    title: "Продажи клубных карт",
    description: "Скрипты, работа с возражениями, закрытие сделки.",
    icon: "TrendingUp",
    accent: "#ffd60a",
    accessLevel: "advanced",
    order: 1,
    status: "DRAFT",
    lessonIds: [],
    plannedLessons: 12,
  },
  {
    id: "course-service",
    slug: "service",
    title: "Сервис уровня Metro",
    description: "Стандарты гостеприимства и заботы о клиенте.",
    icon: "HeartHandshake",
    accent: "#6366f1",
    accessLevel: "advanced",
    order: 2,
    status: "DRAFT",
    lessonIds: [],
    plannedLessons: 10,
  },
  {
    id: "course-product",
    slug: "product",
    title: "Продукт и направления",
    description: "Глубокое знание услуг и направлений клуба.",
    icon: "Sparkles",
    accent: "#22c55e",
    accessLevel: "advanced",
    order: 3,
    status: "DRAFT",
    lessonIds: [],
    plannedLessons: 8,
  },
  {
    id: "course-brand",
    slug: "brand",
    title: "Бренд и стандарты",
    description: "Ценности бренда и фирменные стандарты сети.",
    icon: "BadgeCheck",
    accent: "#ec4899",
    accessLevel: "advanced",
    order: 4,
    status: "DRAFT",
    lessonIds: [],
    plannedLessons: 6,
  },
];
