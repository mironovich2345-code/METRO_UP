import { formatTenureRu } from "@/lib/cabinet-ui";
import { formatEmploymentDateRu } from "@/lib/employment-date";

/**
 * Sprint: LIVE QA QA-02 — "Complete Editable Employee Profile". Pure rules for
 * the self-service Profile editor, shared by the Profile UI and
 * PATCH /api/profile (no React, no Prisma, no fetch — directly unit-tested).
 *
 * SOURCE OF TRUTH (product decision, QA-02): the employee's name is ONE
 * app-owned string, `User.displayName` — the same value every screen already
 * shows (team rosters, rating, questions, cabinets) and that onboarding sets
 * ("Как к тебе обращаться?"). The editor presents it as two fields —
 * "Имя" = the first word, "Фамилия" = the rest — and saves them back joined
 * by a single space. No Prisma change.
 *
 * Telegram can never revert an edit: both Telegram auth routes write
 * displayName ONLY when creating a brand-new user (telegram-identity.ts's
 * initialDisplayNameFrom); for an existing user they write only the
 * Telegram-owned telegram* columns (telegramMetadataFrom).
 *
 * Accepted limitation (chosen with the product owner): the boundary between
 * the two parts is not stored separately, so a first name that itself
 * contains a space ("Анна Мария") reopens split at that space. The saved full
 * name — the only thing any other screen shows — is exactly what was entered.
 */

/** The existing onboarding rule for displayName (onboardingSchema in
 * src/lib/server/schemas.ts, isValidDisplayName in src/lib/profile.ts):
 * 2–50 characters after trimming. Reused, never widened or narrowed. */
export const DISPLAY_NAME_MIN_LENGTH = 2;
export const DISPLAY_NAME_MAX_LENGTH = 50;

export interface ProfileNameParts {
  firstName: string;
  lastName: string;
}

export type ProfileNameField = "firstName" | "lastName";
export type ProfileNameFieldErrors = Partial<Record<ProfileNameField, string>>;

export const PROFILE_NAME_MESSAGES = {
  firstNameRequired: "Укажите имя",
  tooShort: `Минимум ${DISPLAY_NAME_MIN_LENGTH} символа`,
  tooLong: `Имя и фамилия вместе — не длиннее ${DISPLAY_NAME_MAX_LENGTH} символов`,
} as const;

/** Trim, and collapse any internal run of whitespace (spaces, tabs, a pasted
 * newline) to one space. Deliberately NO character-class restriction:
 * Cyrillic, Latin, hyphens, apostrophes and spaces are all legitimate. */
export function normalizeNamePart(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** Stored displayName -> the editor's two fields. */
export function splitDisplayName(displayName: string): ProfileNameParts {
  const normalized = normalizeNamePart(displayName);
  const space = normalized.indexOf(" ");
  return space === -1
    ? { firstName: normalized, lastName: "" }
    : { firstName: normalized.slice(0, space), lastName: normalized.slice(space + 1) };
}

/** The editor's two fields -> the displayName that gets stored. An empty last
 * name is allowed (the current model never required one — a Telegram user
 * without a last name keeps a one-word name, nothing fake is added). */
export function composeDisplayName(parts: ProfileNameParts): string {
  const first = normalizeNamePart(parts.firstName);
  const last = normalizeNamePart(parts.lastName);
  return last ? `${first} ${last}` : first;
}

export type ProfileNameValidation =
  | { ok: true; displayName: string }
  | { ok: false; fields: ProfileNameFieldErrors };

export function validateProfileName(parts: ProfileNameParts): ProfileNameValidation {
  const first = normalizeNamePart(parts.firstName);
  if (!first) return { ok: false, fields: { firstName: PROFILE_NAME_MESSAGES.firstNameRequired } };
  const displayName = composeDisplayName(parts);
  if (displayName.length < DISPLAY_NAME_MIN_LENGTH) {
    return { ok: false, fields: { firstName: PROFILE_NAME_MESSAGES.tooShort } };
  }
  if (displayName.length > DISPLAY_NAME_MAX_LENGTH) {
    return normalizeNamePart(parts.lastName)
      ? { ok: false, fields: { lastName: PROFILE_NAME_MESSAGES.tooLong } }
      : { ok: false, fields: { firstName: PROFILE_NAME_MESSAGES.tooLong } };
  }
  return { ok: true, displayName };
}

/** Has the user actually changed the name? Compared on the NORMALIZED full
 * name, so stray spaces — or moving a word between the two fields, which
 * stores the identical string — never count as a change. */
export function isProfileNameDirty(initialDisplayName: string, current: ProfileNameParts): boolean {
  return composeDisplayName(current) !== normalizeNamePart(initialDisplayName);
}

/** Save is offered only for a real, valid change, and never while a save is
 * already in flight (double-submit guard). */
export function canSubmitProfileName(params: {
  initialDisplayName: string;
  current: ProfileNameParts;
  saving: boolean;
}): boolean {
  return !params.saving && isProfileNameDirty(params.initialDisplayName, params.current) && validateProfileName(params.current).ok;
}

/** The ONLY data a self-profile update can ever write. Built field-by-field
 * from the validated name, never by spreading request input — so role,
 * clubId, cityId, positionId, accessStatus, XP, rating, employment dates,
 * RoleAssignments or any user id can never reach the database through this
 * path, whatever a client sends. */
export interface SelfProfileUpdateData {
  displayName: string;
}

export function buildSelfProfileUpdate(input: {
  firstName: string;
  lastName?: string | null;
}): { ok: true; data: SelfProfileUpdateData } | { ok: false; fields: ProfileNameFieldErrors } {
  const result = validateProfileName({ firstName: input.firstName, lastName: input.lastName ?? "" });
  if (!result.ok) return result;
  return { ok: true, data: { displayName: result.displayName } };
}

/**
 * Self-editing is unavailable during a MANAGER/CLUB_MANAGER persona preview:
 * the Profile is then rendering the synthetic preview persona, and the server
 * rejects the write anyway (middleware + requireNoActiveViewAs). A
 * CITY_MANAGER self-preview IS the real actor, so it stays editable — the same
 * rule requireNoActiveViewAs (rbac/view-as.ts) enforces server-side.
 */
export function canSelfEditProfile(viewContext: { previewRole: string } | null | undefined): boolean {
  return !viewContext || viewContext.previewRole === "CITY_MANAGER";
}

export type ProfileSaveErrorKind = "validation" | "authorization" | "rate_limited" | "network" | "server";

export interface ProfileSaveError {
  kind: ProfileSaveErrorKind;
  message: string;
  fields?: ProfileNameFieldErrors;
}

interface ApiErrorLike {
  status: number;
  code: string;
  fields?: Record<string, string>;
}

function isApiErrorLike(error: unknown): error is ApiErrorLike {
  return (
    typeof error === "object" &&
    error !== null &&
    typeof (error as { status?: unknown }).status === "number" &&
    typeof (error as { code?: unknown }).code === "string"
  );
}

/** Turn a failed save into what the editor shows — validation, authorization,
 * rate limit, network and server failures stay distinguishable, and none of
 * them is ever reported as "Раздел недоступен". */
export function describeProfileSaveError(error: unknown): ProfileSaveError {
  if (!isApiErrorLike(error)) {
    return { kind: "network", message: "Не удалось сохранить. Проверьте соединение и попробуйте ещё раз." };
  }
  if (error.status === 400) {
    const fields: ProfileNameFieldErrors = {};
    if (error.fields?.firstName) fields.firstName = error.fields.firstName;
    if (error.fields?.lastName) fields.lastName = error.fields.lastName;
    return { kind: "validation", message: "Проверьте введённые данные.", fields };
  }
  if (error.status === 401) {
    return { kind: "authorization", message: "Сессия истекла. Перезапустите приложение." };
  }
  if (error.status === 403 && error.code === "VIEW_AS_READ_ONLY") {
    return { kind: "authorization", message: "Редактирование недоступно в режиме просмотра." };
  }
  if (error.status === 403 || error.status === 409) {
    return { kind: "authorization", message: "Изменение профиля сейчас недоступно." };
  }
  if (error.status === 429) {
    return { kind: "rate_limited", message: "Слишком много попыток. Подождите минуту и попробуйте снова." };
  }
  return { kind: "server", message: "Не удалось сохранить. Попробуйте ещё раз." };
}

/** The honest empty state for any Profile value that genuinely has no data
 * (no last name, no employment record) — never a fabricated placeholder. */
export const NOT_SET_LABEL = "Не указано";

/** Work-data rows for employment. ONLY a real EmploymentAssignment.startedAt
 * counts (never User.createdAt — an earlier, explicit product decision); with
 * none, both rows say so honestly instead of showing a made-up tenure. */
export function describeEmployment(
  startedAtIso: string | null,
  now: Date = new Date(),
): { startDate: string; tenure: string } {
  if (!startedAtIso) return { startDate: NOT_SET_LABEL, tenure: NOT_SET_LABEL };
  return {
    // QA-04 — the stored value is a calendar date at UTC midnight; formatted
    // in UTC so no viewer timezone shifts it ("15 августа 2024").
    startDate: formatEmploymentDateRu(startedAtIso),
    tenure: formatTenureRu(startedAtIso, now),
  };
}
