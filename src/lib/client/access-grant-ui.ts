import type { AccessStatusDTO } from "@/lib/api/types";

/**
 * Sprint: LIVE QA QA-04, section E — what the Employee Card's «Доступ» block
 * shows. Pure; the permission itself is the server's `canGrantFull`.
 */
export const ACCESS_STATUS_LABEL: Record<AccessStatusDTO, string> = {
  PENDING_APPROVAL: "Ожидает подтверждения",
  LIMITED: "Базовый доступ",
  FULL: "Полный доступ",
  SUSPENDED: "Доступ приостановлен",
};

export function employeeAccessView(access: { status: AccessStatusDTO; canGrantFull: boolean }): {
  label: string;
  /** «Выдать полный доступ» — only for PENDING_APPROVAL/LIMITED, and only when
   * the server says this actor may. Never for FULL (nothing to do) and never
   * for SUSPENDED (un-suspending is a separate, explicit action). */
  showGrant: boolean;
} {
  const grantable = access.status === "PENDING_APPROVAL" || access.status === "LIMITED";
  return { label: ACCESS_STATUS_LABEL[access.status], showGrant: grantable && access.canGrantFull };
}

export function describeGrantFullAccessError(code: string | null): string {
  switch (code) {
    case "VIEW_AS_READ_ONLY":
      return "Действие недоступно в режиме просмотра.";
    case "target_suspended":
      return "Доступ сотрудника приостановлен — полный доступ так не выдаётся.";
    case "access_status_changed":
      return "Статус доступа уже изменился. Обновите экран.";
    case "self_target":
    case "target_role_not_allowed":
    case "target_out_of_scope":
    case "actor_access_restricted":
    case "forbidden":
      return "Недостаточно прав для изменения доступа.";
    default:
      return "Не удалось выдать доступ. Попробуйте ещё раз.";
  }
}
