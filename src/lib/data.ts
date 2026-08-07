import {
  Award,
  BadgeCheck,
  Flame,
  Medal,
  MessageSquareHeart,
  ShieldCheck,
  Sparkles,
  Target,
  UserRound,
  Users,
} from "lucide-react";
import type {
  Achievement,
  Course,
  DailyTask,
  MysteryShopperResult,
  NewsItem,
  RankingEntry,
} from "./types";

// Cities, clubs and positions now live in the content layer (@/content).

/* ---------------------------------- Home --------------------------------- */

export const DAILY_TASKS: DailyTask[] = [
  { id: "t1", title: "Скрипт встречи гостя", xp: 40, done: true, durationMin: 5 },
  { id: "t2", title: "Работа с возражением «дорого»", xp: 60, done: false, durationMin: 8 },
  { id: "t3", title: "Презентация клубной карты", xp: 50, done: false, durationMin: 6 },
];

export const RANKING: RankingEntry[] = [
  { id: "r1", name: "Алина Ковалёва", xp: 8420, position: 1 },
  { id: "r2", name: "Дмитрий Орлов", xp: 7980, position: 2 },
  { id: "r3", name: "Ирина Соколова", xp: 7310, position: 3 },
  { id: "r4", name: "Павел Никитин", xp: 6120, position: 4 },
  { id: "r5", name: "Мария Волкова", xp: 5490, position: 5 },
  { id: "r6", name: "Егор Титов", xp: 4870, position: 6 },
  { id: "me", name: "Вы", xp: 4280, position: 7, isCurrentUser: true },
  { id: "r8", name: "Ольга Белова", xp: 3960, position: 8 },
  { id: "r9", name: "Артур Гусев", xp: 3540, position: 9 },
];

/** Network-wide figures backing the compact Home ranking summary. */
export const RANKING_TOTAL = 248;
/** Positions gained (positive) or lost (negative) over the last week. */
export const RANKING_WEEKLY_CHANGE = 2;

export const MYSTERY_SHOPPER: MysteryShopperResult = {
  score: 92,
  date: "2 дня назад",
  club: "Metro City",
  highlights: [
    "Тёплая встреча гостя",
    "Чёткая презентация карты",
    "Стоит усилить работу с возражениями",
  ],
};

export const NEWS: NewsItem[] = [
  {
    id: "n1",
    title: "Запуск нового направления Metro Recovery",
    excerpt: "Массаж, сауна и восстановление теперь во всех клубах сети.",
    tag: "Продукт",
    date: "Сегодня",
  },
  {
    id: "n2",
    title: "Итоги месяца: рекорд по продлениям",
    excerpt: "Сеть показала лучший результат по удержанию за год.",
    tag: "Компания",
    date: "Вчера",
  },
  {
    id: "n3",
    title: "Обновлённый стандарт сервиса 2026",
    excerpt: "Изучите новые правила общения с гостями в Академии.",
    tag: "Обучение",
    date: "3 дня назад",
  },
];

export const ACHIEVEMENTS: Achievement[] = [
  {
    id: "a1",
    title: "Первая неделя",
    description: "7 дней подряд в обучении",
    icon: Flame,
    earnedAt: "Сегодня",
  },
  {
    id: "a2",
    title: "Мастер продаж",
    description: "Пройден курс по продажам",
    icon: Medal,
    earnedAt: "Вчера",
  },
  {
    id: "a3",
    title: "Идеальный сервис",
    description: "92 балла у тайного покупателя",
    icon: ShieldCheck,
    earnedAt: "2 дня назад",
  },
];

/* -------------------------------- Academy -------------------------------- */

export const COURSES: Course[] = [
  {
    id: "c-sales",
    title: "Продажи клубных карт",
    category: "sales",
    icon: Target,
    totalLessons: 12,
    completedLessons: 9,
    accent: "#FFD60A",
  },
  {
    id: "c-service",
    title: "Сервис уровня Metro",
    category: "service",
    icon: MessageSquareHeart,
    totalLessons: 10,
    completedLessons: 4,
    accent: "#7C9CFF",
  },
  {
    id: "c-product",
    title: "Продукт и направления",
    category: "product",
    icon: Sparkles,
    totalLessons: 8,
    completedLessons: 8,
    accent: "#4ADE80",
  },
  {
    id: "c-brand",
    title: "Бренд и стандарты",
    category: "brand",
    icon: BadgeCheck,
    totalLessons: 6,
    completedLessons: 1,
    accent: "#F472B6",
  },
  {
    id: "c-team",
    title: "Работа в команде",
    category: "service",
    icon: Users,
    totalLessons: 7,
    completedLessons: 2,
    accent: "#22D3EE",
  },
  {
    id: "c-growth",
    title: "Личный рост и карьера",
    category: "brand",
    icon: Award,
    totalLessons: 9,
    completedLessons: 0,
    accent: "#FB923C",
  },
];

export const CATEGORY_LABELS: Record<Course["category"], string> = {
  sales: "Продажи",
  service: "Сервис",
  product: "Продукт",
  brand: "Бренд",
};

/* Continue-learning pointer for the Home screen. */
export const CONTINUE_COURSE = {
  courseId: "c-sales",
  courseTitle: "Продажи клубных карт",
  lessonTitle: "Урок 10 · Закрытие сделки",
  icon: UserRound,
};
