import type { AdminUserRowDTO } from "@/lib/api/knowledge-types";

/**
 * Sprint: LIVE QA QA-05.2 — what one /control/users row shows, computed ONCE
 * and rendered by both the desktop table and the mobile cards (UsersResults),
 * so the two layouts can never show different data. Labels are the ones the
 * table always used, moved here unchanged.
 */
export const USER_ROLE_LABEL: Record<string, string> = { EMPLOYEE: "Сотрудник", CLUB_MANAGER: "Управляющий", SPM: "СПМ", ADMIN: "Администратор" };
export const USER_POSITION_LABEL: Record<string, string> = {
  CLIENT_MANAGER: "Менеджер по работе с клиентами",
  NIGHT_MANAGER: "Ночной менеджер",
  ADMINISTRATOR: "Администратор клуба",
};
export const USER_ACCESS_LABEL: Record<string, string> = { LIMITED: "Ограничен", PENDING_APPROVAL: "Ожидает", FULL: "Полный", SUSPENDED: "Заблокирован" };

export interface AdminUserRowView {
  id: string;
  name: string;
  isSelf: boolean;
  /** "@username" or "—". */
  telegram: string;
  city: string;
  club: string;
  position: string;
  role: string;
  roleLabel: string;
  access: string;
}

export function describeAdminUserRow(u: AdminUserRowDTO, currentUserId: string): AdminUserRowView {
  return {
    id: u.id,
    name: u.displayName,
    isSelf: u.id === currentUserId,
    telegram: u.telegramUsername ? `@${u.telegramUsername}` : "—",
    city: u.cityName ?? "—",
    club: u.clubName ?? "—",
    position: u.positionId ? USER_POSITION_LABEL[u.positionId] ?? u.positionId : "—",
    role: u.role,
    roleLabel: USER_ROLE_LABEL[u.role] ?? u.role,
    access: u.accessStatus ? USER_ACCESS_LABEL[u.accessStatus] ?? u.accessStatus : "—",
  };
}
