/**
 * Sprint: LIVE QA QA-07 — the controlled screen registry for visit analytics
 * (pure, client-safe). A pathname maps to ONE normalized screen key; dynamic
 * segments (lesson slug, question id, …) and query strings never reach the
 * key, so no entity id / search term / token is ever stored. Paths outside
 * the registry (login, onboarding, the splash redirect) are not tracked.
 * The server accepts ONLY keys from this registry, and derives the surface
 * from it — the client cannot choose an arbitrary surface or key.
 */

export type TelemetrySurfaceValue = "MINI_APP" | "CONTROL" | "SPM";

export interface ScreenDef {
  surface: TelemetrySurfaceValue;
  label: string;
  /** Matches a pathname WITHOUT query string. */
  pattern: RegExp;
}

const SEG = "[^/]+";
const p = (path: string) => new RegExp(`^${path}/?$`);

export const SCREENS = {
  // ── Mini App ────────────────────────────────────────────────
  home: { surface: "MINI_APP", label: "Главная", pattern: p("/home") },
  academy: { surface: "MINI_APP", label: "Академия", pattern: p("/academy") },
  academy_course: { surface: "MINI_APP", label: "Курс", pattern: p(`/academy/(?!lesson$)${SEG}`) },
  academy_lesson: { surface: "MINI_APP", label: "Урок", pattern: p(`/academy/lesson/${SEG}`) },
  knowledge: { surface: "MINI_APP", label: "База знаний", pattern: p("/knowledge") },
  scripts: { surface: "MINI_APP", label: "Скрипты", pattern: p("/scripts") },
  script: { surface: "MINI_APP", label: "Скрипт", pattern: p(`/scripts/${SEG}`) },
  instructions: { surface: "MINI_APP", label: "Инструкции", pattern: p("/instructions") },
  instruction: { surface: "MINI_APP", label: "Инструкция", pattern: p(`/instructions/${SEG}`) },
  metric: { surface: "MINI_APP", label: "Метрик", pattern: p("/metric") },
  plan: { surface: "MINI_APP", label: "План дня", pattern: p("/plan") },
  ranking: { surface: "MINI_APP", label: "Рейтинг", pattern: p("/ranking") },
  achievements: { surface: "MINI_APP", label: "Достижения", pattern: p("/achievements") },
  mystery_shopper: { surface: "MINI_APP", label: "Тайный покупатель", pattern: p("/mystery-shopper") },
  team: { surface: "MINI_APP", label: "Моя команда", pattern: p("/team") },
  employee_card: { surface: "MINI_APP", label: "Карточка сотрудника", pattern: p("/team/employee") },
  city: { surface: "MINI_APP", label: "Мой город", pattern: p("/city") },
  city_club: { surface: "MINI_APP", label: "Клуб города", pattern: p("/city/club") },
  city_managers: { surface: "MINI_APP", label: "Управляющие города", pattern: p("/city/managers") },
  city_training: { surface: "MINI_APP", label: "Обучение города", pattern: p("/city/training") },
  questions: { surface: "MINI_APP", label: "Вопросы", pattern: p("/questions") },
  question_ask: { surface: "MINI_APP", label: "Новый вопрос", pattern: p("/questions/ask") },
  question_detail: { surface: "MINI_APP", label: "Вопрос", pattern: p(`/questions/(?!ask$)${SEG}`) },
  profile: { surface: "MINI_APP", label: "Профиль", pattern: p("/profile") },
  // ── Control ────────────────────────────────────────────────
  control_home: { surface: "CONTROL", label: "Control — Главная", pattern: p("/control") },
  control_metric: { surface: "CONTROL", label: "Control — Метрик", pattern: p("/control/metric") },
  control_metric_documents: { surface: "CONTROL", label: "Control — Документы Метрика", pattern: p("/control/metric/documents") },
  control_metric_usage: { surface: "CONTROL", label: "Control — Расходы Метрика", pattern: p("/control/metric-usage") },
  control_visits: { surface: "CONTROL", label: "Control — Посещаемость", pattern: p("/control/visits") },
  control_roles: { surface: "CONTROL", label: "Control — Роли", pattern: p("/control/roles") },
  control_users: { surface: "CONTROL", label: "Control — Сотрудники", pattern: p("/control/users") },
  control_logs: { surface: "CONTROL", label: "Control — Логи", pattern: p("/control/logs") },
  control_scripts: { surface: "CONTROL", label: "Control — Скрипты", pattern: p("/control/scripts") },
  control_instructions: { surface: "CONTROL", label: "Control — Инструкции", pattern: p("/control/instructions") },
  control_club: { surface: "CONTROL", label: "Control — Управляющий", pattern: p("/control/club") },
  control_team: { surface: "CONTROL", label: "Control — Команда", pattern: p("/control/team") },
  control_plan: { surface: "CONTROL", label: "Control — План дня", pattern: p("/control/plan") },
  control_city: { surface: "CONTROL", label: "Control — Мои клубы", pattern: p("/control/city") },
  control_city_club: { surface: "CONTROL", label: "Control — Клуб города", pattern: p("/control/city/club") },
  control_network: { surface: "CONTROL", label: "Control — Сеть", pattern: p("/control/network") },
  control_learning_overview: { surface: "CONTROL", label: "Control — Обучение (обзор)", pattern: p("/admin") },
  control_learning: { surface: "CONTROL", label: "Control — Обучение", pattern: p("/admin/content") },
  control_lesson_editor: { surface: "CONTROL", label: "Control — Редактор урока", pattern: p(`/admin/content/lessons/${SEG}`) },
  control_media: { surface: "CONTROL", label: "Control — Медиа", pattern: p("/admin/media") },
  // ── SPM ────────────────────────────────────────────────────
  spm_home: { surface: "SPM", label: "СПМ — Обзор", pattern: p("/spm") },
  spm_sales: { surface: "SPM", label: "Продажи", pattern: p("/spm/sales") },
  spm_mystery: { surface: "SPM", label: "Тайный покупатель (контроль)", pattern: p("/spm/mystery") },
  spm_rating: { surface: "SPM", label: "Рейтинг сотрудников", pattern: p("/spm/rating") },
} as const satisfies Record<string, ScreenDef>;

export type ScreenKey = keyof typeof SCREENS;

const ENTRIES = Object.entries(SCREENS) as Array<[ScreenKey, ScreenDef]>;

export function isScreenKey(key: unknown): key is ScreenKey {
  return typeof key === "string" && Object.prototype.hasOwnProperty.call(SCREENS, key);
}

/** pathname (query string / hash ignored) → screen key, or null = not tracked. */
export function resolveScreenKey(pathname: string | null | undefined): ScreenKey | null {
  if (!pathname) return null;
  const path = pathname.split(/[?#]/)[0];
  for (const [key, def] of ENTRIES) if (def.pattern.test(path)) return key;
  return null;
}

export function screenSurface(key: ScreenKey): TelemetrySurfaceValue {
  return SCREENS[key].surface;
}

/** Display label for a stored key; unknown (e.g. a retired key) → the key itself. */
export function screenLabel(key: string): string {
  return isScreenKey(key) ? SCREENS[key].label : key;
}
