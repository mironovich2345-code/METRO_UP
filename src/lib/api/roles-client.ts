import { ApiError } from "./client";
import type { NetworkRoleDTO, RoleScopeTypeDTO, RoleAssignmentRowDTO } from "./roles-types";

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

export interface CreateRoleAssignmentBody {
  userId: string;
  role: NetworkRoleDTO;
  scopeType: RoleScopeTypeDTO;
  cityId?: string | null;
  clubId?: string | null;
  reason?: string | null;
}

/** Sprint 1 / Phase 2B — src/app/api/control/roles/**. */
export const rolesApi = {
  list: (filter?: { userId?: string; role?: string; status?: string; cityId?: string; clubId?: string }) =>
    request<{ assignments: RoleAssignmentRowDTO[] }>(`/api/control/roles${qs(filter ?? {})}`),
  create: (body: CreateRoleAssignmentBody) =>
    request<{ assignment: RoleAssignmentRowDTO }>(`/api/control/roles`, { method: "POST", body: JSON.stringify(body) }),
  revoke: (id: string, reason?: string | null) =>
    request<{ assignment: RoleAssignmentRowDTO }>(`/api/control/roles/${id}/revoke`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),
  restore: (id: string, reason?: string | null) =>
    request<{ assignment: RoleAssignmentRowDTO }>(`/api/control/roles/${id}/restore`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),
};

/** Sprint 1 / Phase 2B — src/app/api/control/view-as/**. */
export const viewAsApi = {
  start: (body: {
    role: "MANAGER" | "CLUB_MANAGER" | "CITY_MANAGER";
    clubId?: string | null;
    cityId?: string | null;
    /** Required when role === "MANAGER" — see view-as-schemas.ts. */
    previewPositionId?: "CLIENT_MANAGER" | "NIGHT_MANAGER" | "ADMINISTRATOR" | null;
    reason?: string | null;
  }) => request<{ viewContext: unknown }>(`/api/control/view-as/start`, { method: "POST", body: JSON.stringify(body) }),
  end: () => request<{ ended: true }>(`/api/control/view-as/end`, { method: "POST" }),
};

export interface ClubSummaryDTO {
  id: string;
  name: string;
  cityId: string;
  cityName: string | null;
}

/** Sprint 1 / Phase 2B — GET /api/control/city/clubs (CITY_MANAGER's own clubs). */
export const cityApi = {
  clubs: () => request<{ clubs: ClubSummaryDTO[] }>(`/api/control/city/clubs`),
};

export interface NetworkCitySummaryDTO {
  id: string;
  name: string;
  clubs: { id: string; name: string; employeeCount: number }[];
}

/** Sprint 1 / Phase 2B — GET /api/control/network (OPERATIONS_DIRECTOR read tree). */
export const networkApi = {
  tree: () => request<{ cities: NetworkCitySummaryDTO[] }>(`/api/control/network`),
};
