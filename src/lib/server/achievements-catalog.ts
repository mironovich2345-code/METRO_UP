/**
 * Production achievement catalog (v1). Reference data — icons are lucide names.
 * Definitions are upserted into `achievement_definitions`; awards are never based
 * on mock data. Only FIRST_LESSON and PERFECT_QUIZ are auto-awarded this sprint;
 * the rest are defined and wait for their production inputs (rating/mystery/sales).
 */
export type AchievementCategory = "LEARNING" | "RATING" | "MYSTERY" | "SALES";

export interface AchievementDef {
  code: string;
  title: string;
  description: string;
  category: AchievementCategory;
  icon: string;
}

export const ACHIEVEMENT_CATALOG: AchievementDef[] = [
  // LEARNING
  { code: "FIRST_LESSON", title: "Первый шаг", description: "Завершить первый урок.", category: "LEARNING", icon: "Footprints" },
  { code: "ADAPTATION_COMPLETE", title: "База пройдена", description: "Завершить базовую адаптацию.", category: "LEARNING", icon: "GraduationCap" },
  { code: "PERFECT_QUIZ", title: "Без ошибок", description: "Получить 100% за тест.", category: "LEARNING", icon: "CheckCheck" },
  { code: "ACADEMY_10", title: "Вошёл во вкус", description: "Завершить 10 уроков.", category: "LEARNING", icon: "Flame" },
  { code: "ACADEMY_25", title: "Системный рост", description: "Завершить 25 уроков.", category: "LEARNING", icon: "TrendingUp" },
  // RATING
  { code: "FIRST_RATING", title: "Первый результат", description: "Впервые попасть в опубликованный месячный рейтинг.", category: "RATING", icon: "Medal" },
  { code: "TOP_10", title: "В десятке", description: "Попасть в TOP-10 месяца.", category: "RATING", icon: "Trophy" },
  { code: "TOP_3", title: "На пьедестале", description: "Попасть в TOP-3 месяца.", category: "RATING", icon: "Award" },
  { code: "BEST_MANAGER", title: "Лучший менеджер месяца", description: "Занять 1 место.", category: "RATING", icon: "Crown" },
  { code: "BIGGEST_GROWTH", title: "Рывок месяца", description: "Показать наибольший рост позиции к предыдущему месяцу.", category: "RATING", icon: "Rocket" },
  // MYSTERY
  { code: "MYSTERY_90", title: "Сервис 90+", description: "Получить 90+.", category: "MYSTERY", icon: "Star" },
  { code: "MYSTERY_95", title: "Сервис 95+", description: "Получить 95+.", category: "MYSTERY", icon: "Sparkles" },
  { code: "MYSTERY_100", title: "Безупречно", description: "Получить 100.", category: "MYSTERY", icon: "BadgeCheck" },
  // SALES
  { code: "PLAN_100", title: "План выполнен", description: "Выполнить 100% личного плана.", category: "SALES", icon: "Target" },
  { code: "PLAN_110", title: "Выше плана", description: "Выполнить 110%+.", category: "SALES", icon: "ArrowUp" },
  { code: "PLAN_STREAK_3", title: "Стабильный результат", description: "Выполнить план 3 месяца подряд.", category: "SALES", icon: "Repeat" },
];

export const ACHIEVEMENT_BY_CODE = new Map(ACHIEVEMENT_CATALOG.map((a) => [a.code, a]));
