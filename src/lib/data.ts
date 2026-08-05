import {
  Award,
  BadgeCheck,
  Dumbbell,
  Flame,
  HeartHandshake,
  Medal,
  MessageSquareHeart,
  Salad,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  UserRound,
  Users,
} from "lucide-react";
import type {
  Achievement,
  City,
  Club,
  Course,
  DailyTask,
  MysteryShopperResult,
  NewsItem,
  Position,
  RankingEntry,
} from "./types";

/* --------------------------------- Setup --------------------------------- */

export const CITIES: City[] = [
  { id: "moscow", name: "Москва", clubsCount: 24 },
  { id: "spb", name: "Санкт-Петербург", clubsCount: 12 },
  { id: "kazan", name: "Казань", clubsCount: 5 },
  { id: "ekb", name: "Екатеринбург", clubsCount: 6 },
  { id: "novosibirsk", name: "Новосибирск", clubsCount: 4 },
  { id: "krasnodar", name: "Краснодар", clubsCount: 3 },
];

export const CLUBS: Club[] = [
  { id: "msk-city", cityId: "moscow", name: "Metro City", address: "Пресненская наб., 12" },
  { id: "msk-arbat", cityId: "moscow", name: "Metro Arbat", address: "ул. Новый Арбат, 21" },
  { id: "msk-sokol", cityId: "moscow", name: "Metro Sokol", address: "Ленинградский пр., 74" },
  { id: "msk-vdnh", cityId: "moscow", name: "Metro VDNH", address: "пр. Мира, 119" },
  { id: "spb-nevsky", cityId: "spb", name: "Metro Nevsky", address: "Невский пр., 88" },
  { id: "spb-moskovsky", cityId: "spb", name: "Metro Moskovsky", address: "Московский пр., 210" },
  { id: "kzn-kremlin", cityId: "kazan", name: "Metro Kremlin", address: "ул. Баумана, 44" },
  { id: "ekb-plaza", cityId: "ekb", name: "Metro Plaza", address: "ул. Малышева, 5" },
  { id: "nsk-center", cityId: "novosibirsk", name: "Metro Center", address: "Красный пр., 101" },
  { id: "krd-park", cityId: "krasnodar", name: "Metro Park", address: "ул. Красная, 176" },
];

export const POSITIONS: Position[] = [
  {
    id: "trainer",
    title: "Персональный тренер",
    description: "Тренировки и сопровождение клиентов",
    icon: Dumbbell,
  },
  {
    id: "sales",
    title: "Менеджер по продажам",
    description: "Продажи абонементов и услуг",
    icon: TrendingUp,
  },
  {
    id: "reception",
    title: "Администратор",
    description: "Встреча гостей и сервис на ресепшн",
    icon: HeartHandshake,
  },
  {
    id: "nutrition",
    title: "Нутрициолог",
    description: "Питание и восстановление клиентов",
    icon: Salad,
  },
];

export function clubsForCity(cityId: string | null): Club[] {
  if (!cityId) return [];
  return CLUBS.filter((club) => club.cityId === cityId);
}

export function cityById(id: string | null): City | undefined {
  return id ? CITIES.find((c) => c.id === id) : undefined;
}

export function clubById(id: string | null): Club | undefined {
  return id ? CLUBS.find((c) => c.id === id) : undefined;
}

export function positionById(id: string | null): Position | undefined {
  return id ? POSITIONS.find((p) => p.id === id) : undefined;
}

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
