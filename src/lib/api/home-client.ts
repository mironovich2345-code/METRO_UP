import { ApiError } from "./client";
import type {
  AchievementDTO,
  DailyPlanDTO,
  DailyTaskDTO,
  HomeDashboardDTO,
  RatingBoardDTO,
} from "./home-types";

/** Fetch wrappers for the production Home dashboard, plan, rating, achievements.
 * Same-origin, session-cookie auth; no userId is sent from the client. */
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

export function fetchHome() {
  return request<HomeDashboardDTO>("/api/home");
}
export function fetchPlanToday() {
  return request<DailyPlanDTO>("/api/plan/today");
}
export function completePlanTask(id: string) {
  return request<{ task: DailyTaskDTO }>(`/api/plan/tasks/${id}/complete`, { method: "POST" });
}
export function skipPlanTask(id: string) {
  return request<{ task: DailyTaskDTO }>(`/api/plan/tasks/${id}/skip`, { method: "POST" });
}
export function toggleChecklistItem(taskId: string, itemId: string, done: boolean) {
  return request<{ task: DailyTaskDTO }>(`/api/plan/tasks/${taskId}/checklist`, {
    method: "POST",
    body: JSON.stringify({ itemId, done }),
  });
}
export function fetchRatingBoard() {
  return request<RatingBoardDTO>("/api/rating");
}
export function fetchAchievements() {
  return request<{ achievements: AchievementDTO[] }>("/api/achievements");
}
