import type {
  ManagerMonthlySales,
  MonthlyAward,
  MysteryShopperResult,
  RatingEmployee,
  RatingPeriod,
} from "./types";

/** The employee viewing the app (mock; would come from auth later). */
export const CURRENT_EMPLOYEE_ID = "emp-you";

/** The rating is built for the PREVIOUS calendar month and is PUBLISHED. */
export const RATING_PERIOD: RatingPeriod = {
  month: 7,
  year: 2026,
  status: "PUBLISHED",
};

interface Seed {
  id: string;
  name: string;
  clubId: string;
  /** % of personal plan (manager input). */
  sales: number;
  /** Mystery-shopper score 0–100 (SPM input). */
  mystery: number;
  /** Rank in the previous month, for delta. */
  prevRank: number;
}

/** 22 employees across the real club network, varied results & standings. */
const SEED: Seed[] = [
  { id: "emp-1", name: "Алина Ковалёва", clubId: "yekaterinburg-amundsena-63", sales: 142, mystery: 98, prevRank: 1 },
  { id: "emp-2", name: "Дмитрий Орлов", clubId: "chelyabinsk-lenina-86", sales: 138, mystery: 96, prevRank: 3 },
  { id: "emp-3", name: "Ирина Соколова", clubId: "novosibirsk-krasnyy-182", sales: 133, mystery: 97, prevRank: 2 },
  { id: "emp-4", name: "Павел Никитин", clubId: "samara-kirova-147", sales: 130, mystery: 95, prevRank: 5 },
  { id: "emp-5", name: "Мария Волкова", clubId: "ufa-mendeleeva-137", sales: 126, mystery: 96, prevRank: 4 },
  { id: "emp-6", name: "Егор Титов", clubId: "omsk-mira-42-1", sales: 122, mystery: 94, prevRank: 8 },
  { id: "emp-7", name: "Ольга Белова", clubId: "spb-pyatiletok-1a", sales: 120, mystery: 92, prevRank: 6 },
  { id: "emp-8", name: "Артур Гусев", clubId: "voronezh-pobedy-50", sales: 118, mystery: 93, prevRank: 9 },
  { id: "emp-9", name: "Никита Фомин", clubId: "krasnoyarsk-krasnoy-armii-10", sales: 116, mystery: 90, prevRank: 7 },
  { id: "emp-10", name: "Дарья Орлова", clubId: "tyumen-yamskaya-118", sales: 114, mystery: 92, prevRank: 12 },
  { id: "emp-11", name: "Сергей Зайцев", clubId: "kemerovo-shakhterov-87", sales: 113, mystery: 91, prevRank: 10 },
  { id: "emp-12", name: "Анна Лебедева", clubId: "samara-novo-sadovaya-381-1", sales: 112, mystery: 92, prevRank: 11 },
  { id: "emp-13", name: "Роман Козлов", clubId: "chelyabinsk-pobedy-392", sales: 112, mystery: 90, prevRank: 15 },
  { id: "emp-you", name: "Вы", clubId: "nizhny-novgorod-poltavskaya-30", sales: 110, mystery: 92, prevRank: 17 },
  { id: "emp-15", name: "Виктория Попова", clubId: "ryazan-chapaeva-56", sales: 108, mystery: 94, prevRank: 13 },
  { id: "emp-16", name: "Максим Соловьёв", clubId: "tomsk-irkutskiy-trakt-68", sales: 106, mystery: 92, prevRank: 16 },
  { id: "emp-17", name: "Юлия Морозова", clubId: "ufa-gagarina-1-3", sales: 104, mystery: 90, prevRank: 14 },
  { id: "emp-18", name: "Илья Волков", clubId: "omsk-maslennikova-19", sales: 100, mystery: 92, prevRank: 19 },
  { id: "emp-19", name: "Полина Крылова", clubId: "saratov-tarkhova-58", sales: 98, mystery: 88, prevRank: 18 },
  { id: "emp-20", name: "Артём Смирнов", clubId: "barnaul-krasnoarmeyskiy-26", sales: 94, mystery: 90, prevRank: 20 },
  { id: "emp-21", name: "Ксения Новикова", clubId: "lipetsk-stakhanova-36", sales: 90, mystery: 86, prevRank: 22 },
  { id: "emp-22", name: "Глеб Медведев", clubId: "tula-lozhevaya-125a", sales: 85, mystery: 84, prevRank: 21 },
];

const MYSTERY_COMMENTS = [
  "Тёплая встреча гостя, уверенная презентация.",
  "Хорошая работа с потребностями клиента.",
  "Чёткое соблюдение стандартов сервиса.",
  "Стоит усилить работу с возражениями.",
  "Внимательный и доброжелательный сервис.",
];

export const EMPLOYEES: RatingEmployee[] = SEED.map((s) => ({
  id: s.id,
  name: s.name,
  clubId: s.clubId,
}));

export const MANAGER_SALES: ManagerMonthlySales[] = SEED.map((s) => ({
  employeeId: s.id,
  month: RATING_PERIOD.month,
  year: RATING_PERIOD.year,
  plan: 1_000_000,
  fact: Math.round((1_000_000 * s.sales) / 100),
  percent: s.sales,
}));

export const MYSTERY_RESULTS: MysteryShopperResult[] = SEED.map((s, i) => ({
  employeeId: s.id,
  month: RATING_PERIOD.month,
  year: RATING_PERIOD.year,
  score: s.mystery,
  comment: MYSTERY_COMMENTS[i % MYSTERY_COMMENTS.length],
}));

export const PREVIOUS_RANKS: Record<string, number> = Object.fromEntries(
  SEED.map((s) => [s.id, s.prevRank]),
);

/** Month awards — architecture only (types + mock), not shown on screen yet. */
export const MONTHLY_AWARDS: MonthlyAward[] = [
  { type: "BEST_MANAGER", month: 7, year: 2026, employeeId: "emp-1" },
  { type: "BEST_MYSTERY_SHOPPER", month: 7, year: 2026, employeeId: "emp-1" },
  { type: "BIGGEST_GROWTH", month: 7, year: 2026, employeeId: "emp-you" },
  { type: "ROOKIE_OF_MONTH", month: 7, year: 2026, employeeId: "emp-20" },
];
