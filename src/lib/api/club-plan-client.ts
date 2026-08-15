import { ApiError } from "./client";
import type { ClubPlanDTO, ClubTaskTarget, ClubTeamDTO, EmployeePositionDTO, TaskPriorityDTO } from "./club-plan-types";

export interface ChecklistItemInput { id?: string; text: string; required?: boolean; order?: number }

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data?.error ?? "error", data?.fields);
  return data as T;
}

/** Append the ADMIN-selected club scope. Ignored server-side for CLUB_MANAGER. */
function scopeQs(clubId?: string | null, extra?: Record<string, string>): string {
  const sp = new URLSearchParams(extra);
  if (clubId) sp.set("clubId", clubId);
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export const managerApi = {
  plan: (date?: string, clubId?: string | null) =>
    request<ClubPlanDTO>(`/api/control/plan${scopeQs(clubId, date ? { date } : undefined)}`),
  team: (clubId?: string | null) => request<ClubTeamDTO>(`/api/control/team${scopeQs(clubId)}`),

  createTask: (
    body: {
      title: string; description?: string | null; date: string; required?: boolean;
      priority?: TaskPriorityDTO; timeHint?: string | null; checklist?: ChecklistItemInput[]; target: ClubTaskTarget;
    },
    clubId?: string | null,
  ) => request<{ count: number }>(`/api/control/plan/tasks${scopeQs(clubId)}`, { method: "POST", body: JSON.stringify(body) }),
  deleteTask: (id: string, clubId?: string | null) =>
    request<{ ok: true }>(`/api/control/plan/tasks/${id}${scopeQs(clubId)}`, { method: "DELETE" }),

  createTemplate: (
    body: {
      title: string; description?: string | null; targetPosition?: EmployeePositionDTO | null;
      required?: boolean; priority?: TaskPriorityDTO; timeHint?: string | null; checklist?: ChecklistItemInput[];
    },
    clubId?: string | null,
  ) => request<{ template: unknown }>(`/api/control/templates${scopeQs(clubId)}`, { method: "POST", body: JSON.stringify(body) }),
  updateTemplate: (id: string, body: Record<string, unknown>, clubId?: string | null) =>
    request<{ template: unknown }>(`/api/control/templates/${id}${scopeQs(clubId)}`, { method: "PATCH", body: JSON.stringify(body) }),
  reorderTemplates: (ids: string[], clubId?: string | null) =>
    request<{ ok: true }>(`/api/control/templates/reorder${scopeQs(clubId)}`, { method: "POST", body: JSON.stringify({ ids }) }),
};
