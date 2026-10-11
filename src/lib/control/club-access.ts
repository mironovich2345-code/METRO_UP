import type { AccessStatusDTO } from "@/lib/api/types";

/**
 * Sprint: LIVE QA QA-05.1 — the ONE access-lifecycle mapping for a club's
 * employees, shared by «Управляющий» (/control/club) and the /control/team
 * compatibility page so the two can never drift. Pure; tested in
 * tests/qa-05-1.test.ts. The rules are exactly the ones /control/team has
 * always used (Sprint 1 / Phase 2B), never a new access model:
 *
 *   PENDING_APPROVAL -> «Подтвердить»          managerApi.approve(FULL)
 *   LIMITED          -> «Выдать полный доступ» managerApi.setAccess(FULL)
 *   FULL             -> «Приостановить»        managerApi.setAccess(SUSPENDED)
 *   SUSPENDED        -> «Восстановить»         managerApi.setAccess(FULL)
 *
 * Approval and un-suspension stay DIFFERENT actions on different endpoints:
 * the server refuses setAccess on a PENDING target (409) and audits
 * SUSPENDED -> FULL as ACCESS_RESTORED, never as a first approval.
 */

export const CLUB_ACCESS_LABEL: Record<AccessStatusDTO, string> = {
  PENDING_APPROVAL: "Ожидает подтверждения",
  LIMITED: "Ограниченный доступ",
  FULL: "Полный доступ",
  SUSPENDED: "Доступ приостановлен",
};

export type ClubAccessActionKind = "approve" | "grant_full" | "suspend" | "restore";

export interface ClubAccessAction {
  kind: ClubAccessActionKind;
  label: string;
  /** Which existing endpoint: approve (PENDING only) or setAccess. */
  endpoint: "approve" | "setAccess";
  target: "FULL" | "SUSPENDED";
  /** A destructive action is styled quietly (never the bright primary). */
  destructive: boolean;
}

export function nextClubAccessAction(status: AccessStatusDTO): ClubAccessAction {
  switch (status) {
    case "PENDING_APPROVAL":
      return { kind: "approve", label: "Подтвердить", endpoint: "approve", target: "FULL", destructive: false };
    case "LIMITED":
      return { kind: "grant_full", label: "Выдать полный доступ", endpoint: "setAccess", target: "FULL", destructive: false };
    case "FULL":
      return { kind: "suspend", label: "Приостановить", endpoint: "setAccess", target: "SUSPENDED", destructive: true };
    case "SUSPENDED":
      return { kind: "restore", label: "Восстановить", endpoint: "setAccess", target: "FULL", destructive: false };
  }
}

/** Apply the server-confirmed status to one row; other rows are untouched. */
export function applyMemberAccessStatus<T extends { userId: string; accessStatus: AccessStatusDTO }>(
  members: T[],
  userId: string,
  accessStatus: AccessStatusDTO,
): T[] {
  return members.map((m) => (m.userId === userId ? { ...m, accessStatus } : m));
}

/** A failed access change -> the message shown (the roster stays as it was). */
export function describeClubAccessError(error: unknown): string {
  const e = typeof error === "object" && error !== null ? (error as { status?: unknown; code?: unknown }) : {};
  if (e.code === "VIEW_AS_READ_ONLY") return "Изменение доступа недоступно в режиме просмотра.";
  if (e.code === "pending_approval") return "Сотрудник ещё не подтверждён — сначала подтвердите его.";
  if (e.code === "not_pending") return "Заявка уже обработана. Обновите список.";
  if (e.status === 403) return "Недостаточно прав для изменения доступа.";
  if (e.status === 409) return "Статус уже изменился. Обновите список.";
  if (typeof e.status === "number") return "Не удалось изменить доступ. Попробуйте ещё раз.";
  return "Не удалось изменить доступ. Проверьте соединение.";
}
