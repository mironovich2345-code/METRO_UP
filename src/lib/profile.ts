import {
  getCityById,
  getClubById,
  isClubInCity,
} from "@/content/cities";
import { isValidPositionId, type PositionId } from "@/content/positions";

/** Career ladder level. UI/types ready ahead of backend logic. */
// Values mirror the Prisma enums (DB is the source of truth).
export type CareerLevel =
  | "NEWCOMER"
  | "MANAGER"
  | "TOP_MANAGER"
  | "LEADER"
  | "MANAGER_PRO";

/** Platform access tier. Mirrors the Prisma AccessStatus enum. */
export type AccessStatus =
  | "LIMITED"
  | "PENDING_APPROVAL"
  | "FULL"
  | "SUSPENDED";

export const PROFILE_STORAGE_KEY = "metro.profile";
export const PROFILE_VERSION = 2 as const;

/** Persisted employee profile (v2). Names/addresses are resolved from ids. */
export interface UserProfile {
  version: typeof PROFILE_VERSION;
  telegramId: string | null;
  telegramUsername: string | null;
  displayName: string;
  cityId: string;
  clubId: string;
  positionId: PositionId;
  careerLevel: CareerLevel;
  accessStatus: AccessStatus;
  onboardingCompleted: true;
  createdAt: string;
  updatedAt: string;
}

const CAREER_LEVELS = new Set<string>([
  "NEWCOMER",
  "MANAGER",
  "TOP_MANAGER",
  "LEADER",
  "MANAGER_PRO",
]);
const ACCESS_STATUSES = new Set<string>([
  "LIMITED",
  "PENDING_APPROVAL",
  "FULL",
  "SUSPENDED",
]);

function nowISO(): string {
  return new Date().toISOString();
}

/** Onboarding display-name validation: trimmed, 2–50 chars. */
export function isValidDisplayName(name: string): boolean {
  const t = name.trim();
  return t.length >= 2 && t.length <= 50;
}

function sanitizeName(name: unknown): string | null {
  if (typeof name !== "string") return null;
  const t = name.trim();
  if (t.length < 2 || t.length > 50) return null;
  return t;
}

export interface NewProfileInput {
  telegramId: string | null;
  telegramUsername: string | null;
  displayName: string;
  cityId: string;
  clubId: string;
  positionId: PositionId;
}

/** Build a fresh v2 profile at onboarding completion. Always NEWCOMER/LIMITED. */
export function createProfile(input: NewProfileInput): UserProfile {
  const ts = nowISO();
  return {
    version: PROFILE_VERSION,
    telegramId: input.telegramId,
    telegramUsername: input.telegramUsername,
    displayName: input.displayName.trim(),
    cityId: input.cityId,
    clubId: input.clubId,
    positionId: input.positionId,
    careerLevel: "NEWCOMER",
    accessStatus: "LIMITED",
    onboardingCompleted: true,
    createdAt: ts,
    updatedAt: ts,
  };
}

/**
 * Validate & migrate any stored profile shape to v2.
 * Returns a valid v2 profile, or null when onboarding must be repeated.
 * Never throws.
 */
export function validateAndMigrateProfile(raw: unknown): UserProfile | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  const cityId = typeof r.cityId === "string" ? r.cityId : "";
  const clubId = typeof r.clubId === "string" ? r.clubId : "";
  const positionId = r.positionId;

  // Moscow was removed from the network — any Moscow profile is invalid.
  if (cityId === "moscow") return null;

  // City / club / position must resolve against the current network.
  if (!getCityById(cityId)) return null;
  if (!getClubById(clubId)) return null;
  if (!isClubInCity(cityId, clubId)) return null;
  if (!isValidPositionId(positionId)) return null;

  const displayName = sanitizeName(r.displayName) ?? "Сотрудник";
  const careerLevel: CareerLevel =
    typeof r.careerLevel === "string" && CAREER_LEVELS.has(r.careerLevel)
      ? (r.careerLevel as CareerLevel)
      : "NEWCOMER";
  const accessStatus: AccessStatus =
    typeof r.accessStatus === "string" && ACCESS_STATUSES.has(r.accessStatus)
      ? (r.accessStatus as AccessStatus)
      : "LIMITED";
  const createdAt =
    typeof r.createdAt === "string" ? r.createdAt : nowISO();
  const updatedAt =
    typeof r.updatedAt === "string" ? r.updatedAt : createdAt;

  return {
    version: PROFILE_VERSION,
    telegramId: typeof r.telegramId === "string" ? r.telegramId : null,
    telegramUsername:
      typeof r.telegramUsername === "string" ? r.telegramUsername : null,
    displayName,
    cityId,
    clubId,
    positionId,
    careerLevel,
    accessStatus,
    onboardingCompleted: true,
    createdAt,
    updatedAt,
  };
}

/** Safe load from localStorage. Corrupt/invalid data resolves to null. */
export function loadStoredProfile(): UserProfile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PROFILE_STORAGE_KEY);
    if (!raw) return null;
    return validateAndMigrateProfile(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveProfile(profile: UserProfile): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      PROFILE_STORAGE_KEY,
      JSON.stringify({ ...profile, updatedAt: nowISO() }),
    );
  } catch {
    // Storage may be unavailable (private mode) — never crash the app.
  }
}

export function clearStoredProfile(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(PROFILE_STORAGE_KEY);
  } catch {
    /* noop */
  }
}
