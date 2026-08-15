import { ApiError } from "./client";
import type {
  ScriptCategoryDTO,
  ScriptAdminRowDTO,
  ScriptAdminDetailDTO,
  ScriptContentDTO,
  InstructionCategoryDTO,
  InstructionAdminRowDTO,
  InstructionAdminDetailDTO,
  InstructionBlockDTO,
  EmployeeScriptsPayload,
  ScriptDetailDTO,
  EmployeeInstructionsPayload,
  InstructionDetailDTO,
  AdminUserRowDTO,
  AdminUserDetailDTO,
  AdminUserFacetsDTO,
} from "./knowledge-types";

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

function qs(params: Record<string, string | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
  const s = sp.toString();
  return s ? `?${s}` : "";
}

/* ------------------------------ scripts CMS ------------------------------ */

export type ScriptContentInput = Partial<ScriptContentDTO>;

export const scriptsAdminApi = {
  list: (f?: { categoryId?: string; status?: string; q?: string }) =>
    request<{ scripts: ScriptAdminRowDTO[]; categories: ScriptCategoryDTO[] }>(`/api/control/scripts${qs(f ?? {})}`),
  get: (id: string) => request<{ script: ScriptAdminDetailDTO }>(`/api/control/scripts/${id}`),
  create: (body: { categoryId: string; title: string; description?: string | null; content?: ScriptContentInput }) =>
    request<{ script: ScriptAdminDetailDTO }>(`/api/control/scripts`, { method: "POST", body: JSON.stringify(body) }),
  update: (id: string, body: Record<string, unknown>) =>
    request<{ script: ScriptAdminDetailDTO }>(`/api/control/scripts/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  publish: (id: string) =>
    request<{ script: ScriptAdminDetailDTO }>(`/api/control/scripts/${id}/publish`, { method: "POST" }),
  setStatus: (id: string, status: "DRAFT" | "ARCHIVED") =>
    request<{ script: ScriptAdminDetailDTO }>(`/api/control/scripts/${id}/status`, { method: "POST", body: JSON.stringify({ status }) }),
  createCategory: (body: { title: string; description?: string | null }) =>
    request<{ category: ScriptCategoryDTO }>(`/api/control/scripts/categories`, { method: "POST", body: JSON.stringify(body) }),
  updateCategory: (id: string, body: Record<string, unknown>) =>
    request<{ category: ScriptCategoryDTO }>(`/api/control/scripts/categories/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
};

/* --------------------------- instructions CMS ---------------------------- */

export const instructionsAdminApi = {
  list: (f?: { categoryId?: string; status?: string; q?: string }) =>
    request<{ instructions: InstructionAdminRowDTO[]; categories: InstructionCategoryDTO[] }>(`/api/control/instructions${qs(f ?? {})}`),
  get: (id: string) => request<{ instruction: InstructionAdminDetailDTO }>(`/api/control/instructions/${id}`),
  create: (body: { categoryId: string; title: string; summary?: string | null; blocks?: InstructionBlockDTO[] }) =>
    request<{ instruction: InstructionAdminDetailDTO }>(`/api/control/instructions`, { method: "POST", body: JSON.stringify(body) }),
  update: (id: string, body: Record<string, unknown>) =>
    request<{ instruction: InstructionAdminDetailDTO }>(`/api/control/instructions/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  publish: (id: string) =>
    request<{ instruction: InstructionAdminDetailDTO }>(`/api/control/instructions/${id}/publish`, { method: "POST" }),
  setStatus: (id: string, status: "DRAFT" | "ARCHIVED") =>
    request<{ instruction: InstructionAdminDetailDTO }>(`/api/control/instructions/${id}/status`, { method: "POST", body: JSON.stringify({ status }) }),
  createCategory: (body: { title: string; description?: string | null }) =>
    request<{ category: InstructionCategoryDTO }>(`/api/control/instructions/categories`, { method: "POST", body: JSON.stringify(body) }),
  updateCategory: (id: string, body: Record<string, unknown>) =>
    request<{ category: InstructionCategoryDTO }>(`/api/control/instructions/categories/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
};

/* ----------------------------- users (ADMIN) ----------------------------- */

export const usersAdminApi = {
  list: (f?: { cityId?: string; clubId?: string; role?: string; positionId?: string; q?: string }) =>
    request<{ users: AdminUserRowDTO[]; facets: AdminUserFacetsDTO }>(`/api/control/users${qs(f ?? {})}`),
  get: (id: string) => request<{ user: AdminUserDetailDTO }>(`/api/control/users/${id}`),
  update: (id: string, body: Record<string, unknown>) =>
    request<{ user: AdminUserDetailDTO }>(`/api/control/users/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
};

/* ------------------------- employee (PUBLISHED) -------------------------- */

export const knowledgeApi = {
  scripts: () => request<EmployeeScriptsPayload>(`/api/knowledge/scripts`),
  script: (slug: string) => request<{ script: ScriptDetailDTO }>(`/api/knowledge/scripts/${slug}`),
  instructions: () => request<EmployeeInstructionsPayload>(`/api/knowledge/instructions`),
  instruction: (slug: string) => request<{ instruction: InstructionDetailDTO }>(`/api/knowledge/instructions/${slug}`),
};
