import { ApiError } from "./client";
import type {
  AcademyStateDTO,
  LessonCompleteResultDTO,
  LessonDetailDTO,
  QuizSubmitResultDTO,
  XPBalanceDTO,
} from "./content-types";

/**
 * Fetch wrappers for the content platform (employee player + admin CMS). All
 * requests are same-origin and rely on the HttpOnly session cookie; no userId is
 * ever sent from the client.
 */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, data?.error ?? "error", data?.fields ?? data?.details);
  }
  return data as T;
}

/* --------------------------------- employee ------------------------------ */

export async function fetchLesson(slug: string, opts?: { preview?: boolean }) {
  const q = opts?.preview ? "?preview=1" : "";
  const { lesson } = await request<{ lesson: LessonDetailDTO }>(
    `/api/academy/lessons/${encodeURIComponent(slug)}${q}`,
  );
  return lesson;
}
export function startLessonApi(slug: string) {
  return request<{ ok: true }>(`/api/academy/lessons/${encodeURIComponent(slug)}/start`, { method: "POST" });
}
export function completeLessonApi(slug: string) {
  return request<LessonCompleteResultDTO>(`/api/academy/lessons/${encodeURIComponent(slug)}/complete`, { method: "POST" });
}
export function submitQuizApi(
  slug: string,
  answers: { questionId: string; optionIds: string[] }[],
) {
  return request<QuizSubmitResultDTO>(`/api/academy/lessons/${encodeURIComponent(slug)}/quiz`, {
    method: "POST",
    body: JSON.stringify({ answers }),
  });
}
export function fetchAcademyState() {
  return request<AcademyStateDTO>("/api/academy/state");
}
export function fetchXp() {
  return request<XPBalanceDTO>("/api/xp");
}

/* ---------------------------------- admin -------------------------------- */

export interface AdminDashboard {
  programs: { id: string; title: string; status: string; order: number; courses: number; days: number }[];
  totals: {
    programs: number; draftPrograms: number;
    lessonsDraft: number; lessonsPublished: number; lessonsArchived: number; media: number;
  };
}
export interface AdminMediaAsset {
  id: string; kind: string; status: string; mimeType: string; sizeBytes: number;
  originalFilename: string; storageKey: string; durationSeconds: number | null;
}
export interface AdminBlock { id: string; type: string; order: number; data: unknown }
export interface AdminQuizOption { id: string; text: string; isCorrect: boolean; order: number }
export interface AdminQuizQuestion { id: string; text: string; type: string; order: number; explanation: string | null; options: AdminQuizOption[] }
export interface AdminQuiz { id: string; title: string; description: string | null; passingPercent: number; maxAttempts: number | null; xpReward: number; questions: AdminQuizQuestion[] }
export interface AdminLessonDetail {
  id: string; title: string; slug: string; shortDescription: string | null;
  durationMinutes: number; xpReward: number; isRequired: boolean; status: string; courseId: string;
  blocks: AdminBlock[]; quiz: AdminQuiz | null;
  course: { id: string; title: string; program: { id: string; title: string } };
}
export interface AdminProgramTree {
  id: string; title: string; description: string | null; status: string; order: number;
  days: { id: string; title: string; dayNumber: number; order: number }[];
  courses: {
    id: string; title: string; order: number; trainingDayId: string | null;
    lessons: { id: string; title: string; slug: string; status: string; order: number; xpReward: number; isRequired: boolean }[];
  }[];
}

export const adminApi = {
  dashboard: () => request<AdminDashboard>("/api/admin/content"),
  programs: () => request<{ programs: AdminProgramTree[] }>("/api/admin/programs"),
  createProgram: (title: string, description?: string) =>
    request<{ program: unknown }>("/api/admin/programs", { method: "POST", body: JSON.stringify({ title, description }) }),
  updateProgram: (id: string, body: Record<string, unknown>) =>
    request(`/api/admin/programs/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  archiveProgram: (id: string) => request(`/api/admin/programs/${id}`, { method: "DELETE" }),

  createDay: (body: Record<string, unknown>) => request("/api/admin/days", { method: "POST", body: JSON.stringify(body) }),
  updateDay: (id: string, body: Record<string, unknown>) => request(`/api/admin/days/${id}`, { method: "PATCH", body: JSON.stringify(body) }),

  createCourse: (body: Record<string, unknown>) => request("/api/admin/courses", { method: "POST", body: JSON.stringify(body) }),
  updateCourse: (id: string, body: Record<string, unknown>) => request(`/api/admin/courses/${id}`, { method: "PATCH", body: JSON.stringify(body) }),

  createLesson: (body: Record<string, unknown>) => request<{ lesson: { id: string } }>("/api/admin/lessons", { method: "POST", body: JSON.stringify(body) }),
  getLesson: (id: string) => request<{ lesson: AdminLessonDetail; publishErrors: { field: string; code: string; message: string }[] }>(`/api/admin/lessons/${id}`),
  updateLesson: (id: string, body: Record<string, unknown>) => request(`/api/admin/lessons/${id}`, { method: "PATCH", body: JSON.stringify(body) }),

  createBlock: (lessonId: string, type: string, data: unknown, order?: number) =>
    request<{ block: AdminBlock }>(`/api/admin/lessons/${lessonId}/blocks`, { method: "POST", body: JSON.stringify({ type, data, order }) }),
  updateBlock: (blockId: string, body: { data?: unknown; order?: number }) =>
    request(`/api/admin/blocks/${blockId}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteBlock: (blockId: string) => request(`/api/admin/blocks/${blockId}`, { method: "DELETE" }),
  reorderBlocks: (lessonId: string, ids: string[]) =>
    request(`/api/admin/lessons/${lessonId}/blocks/reorder`, { method: "POST", body: JSON.stringify({ ids }) }),

  upsertQuiz: (lessonId: string, body: unknown) =>
    request<{ quiz: AdminQuiz; warnings: unknown[] }>(`/api/admin/lessons/${lessonId}/quiz`, { method: "PUT", body: JSON.stringify(body) }),
  deleteQuiz: (lessonId: string) => request(`/api/admin/lessons/${lessonId}/quiz`, { method: "DELETE" }),

  publishLesson: (id: string) => request<{ lesson: unknown }>(`/api/admin/lessons/${id}/publish`, { method: "POST" }),
  setLessonStatus: (id: string, status: "DRAFT" | "ARCHIVED") =>
    request(`/api/admin/lessons/${id}/status`, { method: "POST", body: JSON.stringify({ status }) }),

  createMediaUpload: (filename: string, contentType: string, sizeBytes: number) =>
    request<{ mediaAssetId: string; uploadUrl: string; storageKey: string; requiredHeaders: Record<string, string>; expiresInSeconds: number }>(
      "/api/admin/media/upload",
      { method: "POST", body: JSON.stringify({ filename, contentType, sizeBytes }) },
    ),
  completeMedia: (id: string, hints: { width?: number; height?: number; durationSeconds?: number }) =>
    request<{ media: AdminMediaAsset }>(`/api/admin/media/${id}/complete`, { method: "POST", body: JSON.stringify(hints) }),
};

/**
 * Full browser upload: create UPLOADING asset → PUT bytes directly to storage →
 * mark READY. Returns the media asset id to reference from a VIDEO/IMAGE block.
 */
export async function uploadFile(
  file: File,
  hints?: { durationSeconds?: number; width?: number; height?: number },
): Promise<{ mediaAssetId: string }> {
  const created = await adminApi.createMediaUpload(file.name, file.type, file.size);
  const put = await fetch(created.uploadUrl, {
    method: "PUT",
    headers: created.requiredHeaders,
    body: file,
  });
  if (!put.ok) throw new ApiError(put.status, "upload_failed");
  const { media } = await adminApi.completeMedia(created.mediaAssetId, hints ?? {});
  return { mediaAssetId: media.id };
}
