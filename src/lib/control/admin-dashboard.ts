/**
 * Sprint: LIVE QA QA-06 — pure presentation rules for the PROJECT_ADMIN Home
 * and the «Логи» page. Tested in tests/qa-06.test.ts.
 */

/** The Home «Логи» card shows the rolling last N minutes... */
export const LOG_CARD_WINDOW_MINUTES = 5;
/** ...and refreshes ONLY its own data this often (no page reload). */
export const LOG_CARD_REFRESH_MS = 5 * 60 * 1000;

/** Readable names for the UserAuditLog actions the app writes today. An
 * unknown action falls back to its raw code (never hidden, never guessed). */
export const AUDIT_ACTION_LABEL: Record<string, string> = {
  ROLE_ASSIGNED: "Назначена роль",
  ROLE_REVOKED: "Роль отозвана",
  ROLE_RESTORED: "Роль восстановлена",
  ACCESS_GRANTED: "Выдан доступ",
  ACCESS_SUSPENDED: "Доступ приостановлен",
  ACCESS_RESTORED: "Доступ восстановлен",
  VIEW_AS_STARTED: "Начат режим просмотра",
  VIEW_AS_ENDED: "Завершён режим просмотра",
  USER_UPDATE: "Изменены данные сотрудника",
  PROFILE_NAME_UPDATED: "Изменено имя в профиле",
  PROFILE_EMPLOYMENT_START_UPDATED: "Изменена дата начала работы",
  ONBOARDING_COMPLETED: "Пройден онбординг",
  DAILY_TASK_ASSIGNED: "Назначена задача",
};

export function describeAuditAction(action: string): string {
  return AUDIT_ACTION_LABEL[action] ?? action;
}

/** "только что" / "3 мин назад" / "14:05" / "12.10, 14:05". */
export function formatLogTime(iso: string, now: Date = new Date()): string {
  const at = new Date(iso);
  const diffMin = Math.floor((now.getTime() - at.getTime()) / 60_000);
  if (diffMin < 1) return "только что";
  if (diffMin < 60) return `${diffMin} мин назад`;
  const time = at.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  const sameDay = at.toDateString() === now.toDateString();
  return sameDay ? time : `${at.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" })}, ${time}`;
}

/** "Иван Петров → Мария С. · Полтавская" — target and place, only when known. */
export function describeAuditContext(row: { actorUserId: string; targetUserId: string; targetName: string | null; clubName: string | null; cityName: string | null }): string {
  const parts: string[] = [];
  if (row.targetUserId !== row.actorUserId && row.targetName) parts.push(row.targetName);
  const place = row.clubName ?? row.cityName;
  if (place) parts.push(place);
  return parts.join(" · ");
}
