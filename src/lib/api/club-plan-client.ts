import { ApiError } from "./client";
import type { ClubPlanDTO, ClubTaskTarget, ClubTeamDTO, EmployeePositionDTO } from "./club-plan-types";

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

export const managerApi = {
  plan: (date?: string) => request<ClubPlanDTO>(`/api/control/plan${date ? `?date=${date}` : ""}`),
  team: () => request<ClubTeamDTO>("/api/control/team"),

  createTask: (body: { title: string; description?: string | null; date: string; required?: boolean; target: ClubTaskTarget }) =>
    request<{ count: number }>("/api/control/plan/tasks", { method: "POST", body: JSON.stringify(body) }),
  deleteTask: (id: string) => request<{ ok: true }>(`/api/control/plan/tasks/${id}`, { method: "DELETE" }),

  createTemplate: (body: { title: string; description?: string | null; targetPosition?: EmployeePositionDTO | null; required?: boolean }) =>
    request<{ template: unknown }>("/api/control/templates", { method: "POST", body: JSON.stringify(body) }),
  updateTemplate: (id: string, body: Record<string, unknown>) =>
    request<{ template: unknown }>(`/api/control/templates/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  reorderTemplates: (ids: string[]) =>
    request<{ ok: true }>("/api/control/templates/reorder", { method: "POST", body: JSON.stringify({ ids }) }),
};
