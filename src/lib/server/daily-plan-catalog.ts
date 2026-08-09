import type { DailyTaskCategory, EmployeePosition } from "@prisma/client";

/**
 * System daily-task templates (v1). CLIENT_MANAGER gets the full 5-task plan;
 * NIGHT_MANAGER / ADMINISTRATOR fall back to a minimal general plan (position:
 * null) — documented placeholder until their real plans are defined.
 */
export interface DailyTemplateDef {
  code: string;
  title: string;
  description: string | null;
  category: DailyTaskCategory;
  position: EmployeePosition | null;
  defaultOrder: number;
}

export const DAILY_TEMPLATES: DailyTemplateDef[] = [
  // CLIENT_MANAGER — full plan
  { code: "CM_LEARNING", title: "Пройти обучение", description: null, category: "LEARNING", position: "CLIENT_MANAGER", defaultOrder: 1 },
  { code: "CM_SALES_PLAN", title: "Проверить план на текущий месяц", description: "Личный план появится после внесения данных СПМ", category: "SALES", position: "CLIENT_MANAGER", defaultOrder: 2 },
  { code: "CM_CLIENTS", title: "Работа с клиентами", description: "Проверь активных клиентов и незавершённые договорённости на сегодня.", category: "CLIENTS", position: "CLIENT_MANAGER", defaultOrder: 3 },
  { code: "CM_SHIFT_CHECK", title: "Проверить незавершённые задачи перед окончанием смены", description: null, category: "SHIFT", position: "CLIENT_MANAGER", defaultOrder: 4 },
  { code: "CM_SHIFT_CLOSE", title: "Закрыть рабочий день", description: null, category: "SHIFT", position: "CLIENT_MANAGER", defaultOrder: 5 },

  // General minimal plan (NIGHT_MANAGER / ADMINISTRATOR)
  { code: "GEN_LEARNING", title: "Пройти обучение", description: null, category: "LEARNING", position: null, defaultOrder: 1 },
  { code: "GEN_SHIFT_CHECK", title: "Проверить задачи смены", description: null, category: "SHIFT", position: null, defaultOrder: 2 },
  { code: "GEN_SHIFT_CLOSE", title: "Закрыть рабочий день", description: null, category: "SHIFT", position: null, defaultOrder: 3 },
];

/** Templates that apply to a given position (position-specific, else general). */
export function templatesForPosition(position: EmployeePosition | null): DailyTemplateDef[] {
  const specific = DAILY_TEMPLATES.filter((t) => t.position === position);
  return specific.length ? specific : DAILY_TEMPLATES.filter((t) => t.position === null);
}

/** Manual completion policy: LEARNING is server-automatic, SALES is blocked
 * (pending sales subsystem), everything else is user-completable. */
export function taskMode(category: DailyTaskCategory): "auto" | "manual" | "blocked" {
  if (category === "LEARNING") return "auto";
  if (category === "SALES") return "blocked";
  return "manual";
}
