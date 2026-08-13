import type { DailyTaskCategory, EmployeePosition } from "@prisma/client";

/**
 * SYSTEM daily-task templates. These are the METRO-UP-owned tasks only:
 * LEARNING (auto) and SALES (blocked). The operational CLIENT_MANAGER work day
 * lives in the STANDARD CLUB PLAN (ClubTaskTemplate defaults, manager-editable) —
 * not here. NIGHT_MANAGER / ADMINISTRATOR keep a minimal general plan (no
 * production-default operational plan is defined for them yet).
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
  // CLIENT_MANAGER — system-owned tasks only (operational tasks are the club plan).
  { code: "CM_LEARNING", title: "Пройти обучение", description: null, category: "LEARNING", position: "CLIENT_MANAGER", defaultOrder: 1 },
  { code: "CM_SALES_PLAN", title: "Проверить план на текущий месяц", description: "Личный план появится после внесения данных СПМ", category: "SALES", position: "CLIENT_MANAGER", defaultOrder: 2 },

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
