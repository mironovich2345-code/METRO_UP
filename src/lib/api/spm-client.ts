import { ApiError } from "./client";
import type {
  SpmMysteryRowDTO,
  SpmOverviewDTO,
  SpmRatingViewDTO,
  SpmSalesRowDTO,
} from "./spm-types";

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

export interface PeriodRef { month: number; year: number }
export interface SpmFilters { cityId?: string; clubId?: string; search?: string }

function qs(period: PeriodRef, filters?: SpmFilters): string {
  const p = new URLSearchParams({ month: String(period.month), year: String(period.year) });
  if (filters?.cityId) p.set("cityId", filters.cityId);
  if (filters?.clubId) p.set("clubId", filters.clubId);
  if (filters?.search) p.set("search", filters.search);
  return p.toString();
}

export const spmApi = {
  overview: (period?: PeriodRef) =>
    request<SpmOverviewDTO>(`/api/spm/overview${period ? `?month=${period.month}&year=${period.year}` : ""}`),

  sales: (period: PeriodRef, filters?: SpmFilters) =>
    request<{ rows: SpmSalesRowDTO[] }>(`/api/spm/sales?${qs(period, filters)}`),
  saveSales: (body: { employeeUserId: string; month: number; year: number; personalPlan: number; personalFact: number }) =>
    request<{ row: unknown }>("/api/spm/sales", { method: "POST", body: JSON.stringify(body) }),

  mystery: (period: PeriodRef, filters?: SpmFilters) =>
    request<{ rows: SpmMysteryRowDTO[] }>(`/api/spm/mystery?${qs(period, filters)}`),
  saveMystery: (body: { employeeUserId: string; month: number; year: number; score: number; checkedAt?: string | null; comment?: string | null }) =>
    request<{ row: { id: string } }>("/api/spm/mystery", { method: "POST", body: JSON.stringify(body) }),
  publishMystery: (id: string) =>
    request<{ row: unknown }>(`/api/spm/mystery/${id}/publish`, { method: "POST" }),

  setEligibility: (body: { employeeUserId: string; month: number; year: number; isEligible: boolean; reason?: string | null }) =>
    request<{ row: unknown }>("/api/spm/eligibility", { method: "POST", body: JSON.stringify(body) }),

  rating: (period: PeriodRef) =>
    request<SpmRatingViewDTO>(`/api/spm/rating?month=${period.month}&year=${period.year}`),
  calculate: (period: PeriodRef) =>
    request<{ ranked: number; eligible: number }>("/api/spm/rating/calculate", { method: "POST", body: JSON.stringify(period) }),
  publish: (period: PeriodRef) =>
    request<{ period: unknown }>("/api/spm/rating/publish", { method: "POST", body: JSON.stringify(period) }),
  reopen: (period: PeriodRef) =>
    request<{ period: unknown }>("/api/spm/rating/reopen", { method: "POST", body: JSON.stringify(period) }),
};
