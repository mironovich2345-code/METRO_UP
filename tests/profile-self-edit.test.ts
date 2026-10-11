import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  DISPLAY_NAME_MAX_LENGTH,
  NOT_SET_LABEL,
  PROFILE_NAME_MESSAGES,
  buildSelfProfileUpdate,
  canSelfEditProfile,
  canSubmitProfileName,
  composeDisplayName,
  describeEmployment,
  describeProfileSaveError,
  isProfileNameDirty,
  normalizeNamePart,
  splitDisplayName,
  validateProfileName,
} from "../src/lib/profile-edit";
import { selfProfileUpdateSchema } from "../src/lib/server/schemas";
import {
  hasTelegramMetadataChanged,
  initialDisplayNameFrom,
  telegramMetadataFrom,
} from "../src/lib/server/telegram-identity";
import { ApiError } from "../src/lib/api/client";
import { formatTenureRu } from "../src/lib/cabinet-ui";

const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");

/** Comments stripped so prose that merely MENTIONS an API never counts. */
function codeOnly(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/**
 * Sprint: LIVE QA QA-02 — "Complete Editable Employee Profile".
 *
 * Source of truth (product decision): the name is the ONE app-owned
 * `User.displayName`; the editor's «Имя»/«Фамилия» are its first word / the
 * rest. Telegram only ever writes displayName when CREATING a user.
 *
 * REAL tests exercise the actual shared rules module, the actual request
 * schema, the actual Telegram builders the auth routes now use, and the
 * actual ApiError class. Structural checks are supplementary wiring proof.
 */

/* ===================================================================== *
 *  Normalization, split / compose
 * ===================================================================== */

test("PROF-A: normalizeNamePart trims and collapses any internal whitespace run (spaces, tabs, a pasted newline) — and never strips legitimate characters", () => {
  assert.equal(normalizeNamePart("  Данил  "), "Данил");
  assert.equal(normalizeNamePart("Анна \t\n Мария"), "Анна Мария");
  for (const name of ["Анна-Мария", "O'Brien", "д'Артаньян", "Jean-Luc", "Ёлкин"]) {
    assert.equal(normalizeNamePart(name), name);
  }
});

test("PROF-B: splitDisplayName — «Имя» is the first word, «Фамилия» is the rest; a one-word name has an empty last name (nothing fake is added)", () => {
  assert.deepEqual(splitDisplayName("Данил"), { firstName: "Данил", lastName: "" });
  assert.deepEqual(splitDisplayName("Данил Миронович"), { firstName: "Данил", lastName: "Миронович" });
  assert.deepEqual(splitDisplayName("  Данил   Миронович "), { firstName: "Данил", lastName: "Миронович" });
  assert.deepEqual(splitDisplayName("Анна-Мария Петрова-Водкина"), { firstName: "Анна-Мария", lastName: "Петрова-Водкина" });
});

test("PROF-C: the accepted limitation, pinned — a first name containing a space reopens split at that space, but the stored full name round-trips EXACTLY", () => {
  const stored = composeDisplayName({ firstName: "Анна Мария", lastName: "Петрова" });
  assert.equal(stored, "Анна Мария Петрова");
  assert.deepEqual(splitDisplayName(stored), { firstName: "Анна", lastName: "Мария Петрова" });
  assert.equal(composeDisplayName(splitDisplayName(stored)), stored, "re-saving the split form stores the identical name");
});

test("PROF-D: compose(split(x)) === normalize(x) for every shape of stored name — opening and saving without edits never alters the stored value", () => {
  for (const stored of ["Данил", "Данил Миронович", "Анна Мария Петрова", "O'Brien", "Jean-Luc Picard", "  Данил  Миронович  "]) {
    assert.equal(composeDisplayName(splitDisplayName(stored)), normalizeNamePart(stored), stored);
  }
});

/* ===================================================================== *
 *  Validation (the existing onboarding rule: 2–50 chars after trim)
 * ===================================================================== */

test("PROF-E: first name is required — empty or whitespace-only is rejected on the firstName field", () => {
  for (const firstName of ["", "   ", "\t\n"]) {
    assert.deepEqual(validateProfileName({ firstName, lastName: "Миронович" }), {
      ok: false,
      fields: { firstName: PROFILE_NAME_MESSAGES.firstNameRequired },
    });
  }
});

test("PROF-F: last name is OPTIONAL (the current model never required one) — a one-word name is valid", () => {
  assert.deepEqual(validateProfileName({ firstName: "Данил", lastName: "" }), { ok: true, displayName: "Данил" });
  assert.deepEqual(validateProfileName({ firstName: "Данил", lastName: "   " }), { ok: true, displayName: "Данил" });
});

test("PROF-G: Cyrillic, Latin, hyphens, apostrophes and spaces are all accepted — no invented character restrictions", () => {
  const cases: [string, string, string][] = [
    ["Данил", "Миронович", "Данил Миронович"],
    ["John", "Smith", "John Smith"],
    ["Анна-Мария", "Петрова-Водкина", "Анна-Мария Петрова-Водкина"],
    ["Шон", "O'Brien", "Шон O'Brien"],
    ["Jean Luc", "Picard", "Jean Luc Picard"],
  ];
  for (const [firstName, lastName, expected] of cases) {
    assert.deepEqual(validateProfileName({ firstName, lastName }), { ok: true, displayName: expected });
  }
});

test("PROF-H: the existing 2–50 bounds are enforced on the stored full name — 1 char is too short, exactly 50 is fine, 51 is too long (reported on the field that was actually filled)", () => {
  assert.deepEqual(validateProfileName({ firstName: "Я", lastName: "" }), { ok: false, fields: { firstName: PROFILE_NAME_MESSAGES.tooShort } });
  const fifty = "А".repeat(DISPLAY_NAME_MAX_LENGTH);
  assert.deepEqual(validateProfileName({ firstName: fifty, lastName: "" }), { ok: true, displayName: fifty });
  assert.deepEqual(validateProfileName({ firstName: fifty + "Б", lastName: "" }), { ok: false, fields: { firstName: PROFILE_NAME_MESSAGES.tooLong } });
  assert.deepEqual(validateProfileName({ firstName: "А".repeat(30), lastName: "Б".repeat(25) }), { ok: false, fields: { lastName: PROFILE_NAME_MESSAGES.tooLong } });
});

/* ===================================================================== *
 *  Dirty state and double-submit decisions
 * ===================================================================== */

test("PROF-I: dirty state — unchanged, whitespace-only edits, and moving a word between the fields are NOT changes (they store the identical name); a real edit is", () => {
  assert.equal(isProfileNameDirty("Данил Миронович", { firstName: "Данил", lastName: "Миронович" }), false);
  assert.equal(isProfileNameDirty("Данил Миронович", { firstName: " Данил ", lastName: "Миронович  " }), false);
  assert.equal(isProfileNameDirty("Анна Мария Петрова", { firstName: "Анна Мария", lastName: "Петрова" }), false);
  assert.equal(isProfileNameDirty("Данил Миронович", { firstName: "Даниил", lastName: "Миронович" }), true);
  assert.equal(isProfileNameDirty("Данил Миронович", { firstName: "Данил", lastName: "" }), true);
});

test("PROF-J: canSubmitProfileName — never while a save is in flight (double-submit), never without a change, never when invalid; only a valid change while idle", () => {
  const initialDisplayName = "Данил Миронович";
  const changed = { firstName: "Даниил", lastName: "Миронович" };
  assert.equal(canSubmitProfileName({ initialDisplayName, current: changed, saving: true }), false);
  assert.equal(canSubmitProfileName({ initialDisplayName, current: { firstName: "Данил", lastName: "Миронович" }, saving: false }), false);
  assert.equal(canSubmitProfileName({ initialDisplayName, current: { firstName: "", lastName: "Миронович" }, saving: false }), false);
  assert.equal(canSubmitProfileName({ initialDisplayName, current: changed, saving: false }), true);
});

/* ===================================================================== *
 *  Allowlist — the update can only ever write displayName
 * ===================================================================== */

const HOSTILE_EXTRAS = {
  userId: "00000000-0000-0000-0000-00000000000b",
  employeeId: "emp-b",
  telegramId: "999",
  displayName: "Подменённое имя",
  role: "ADMIN",
  clubId: "club-other",
  cityId: "city-other",
  positionId: "ADMINISTRATOR",
  accessStatus: "FULL",
  careerLevel: "MANAGER_PRO",
  xp: 99999,
  rating: 1,
  employmentStartedAt: "2010-01-01T00:00:00.000Z",
  startedAt: "2010-01-01T00:00:00.000Z",
  roleAssignments: [{ role: "PROJECT_ADMIN", scopeType: "SYSTEM" }],
  avatarStorageKey: "avatars/someone-else/x.webp",
};

test("PROF-K: the REAL request schema keeps only firstName/lastName — every corporate field, every id (another user's included) and a direct displayName are stripped", () => {
  const parsed = selfProfileUpdateSchema.parse({ firstName: "Данил", lastName: "Миронович", ...HOSTILE_EXTRAS });
  assert.deepEqual(Object.keys(parsed).sort(), ["firstName", "lastName"]);
});

test("PROF-L: THE ATTACK, end to end through the real schema + mapper — whatever is sent, the only write produced is { displayName } built from the two name fields; no other user's id can even be expressed", () => {
  const parsed = selfProfileUpdateSchema.parse({ firstName: " Данил ", lastName: "Миронович", ...HOSTILE_EXTRAS });
  const update = buildSelfProfileUpdate(parsed);
  assert.deepEqual(update, { ok: true, data: { displayName: "Данил Миронович" } });
  if (update.ok) assert.deepEqual(Object.keys(update.data), ["displayName"]);
});

test("PROF-M: even if the mapper were handed a hostile object directly (bypassing the schema), it builds its output field by field — nothing but displayName comes out", () => {
  const update = buildSelfProfileUpdate({ firstName: "Данил", lastName: "Миронович", ...HOSTILE_EXTRAS } as unknown as { firstName: string; lastName: string });
  assert.ok(update.ok);
  if (update.ok) assert.deepEqual(update.data, { displayName: "Данил Миронович" });
});

test("PROF-N: invalid input never produces data — an empty first name returns field errors only", () => {
  assert.deepEqual(buildSelfProfileUpdate({ firstName: "  ", lastName: "Миронович" }), {
    ok: false,
    fields: { firstName: PROFILE_NAME_MESSAGES.firstNameRequired },
  });
});

test("PROF-O: the schema's own shape errors — a missing or non-string first name, or an absurdly long value, is rejected with a Russian field message; lastName may be absent or null", () => {
  const missing = selfProfileUpdateSchema.safeParse({ lastName: "Миронович" });
  assert.equal(missing.success, false);
  if (!missing.success) assert.equal(missing.error.issues[0]?.message, "Укажите имя");
  assert.equal(selfProfileUpdateSchema.safeParse({ firstName: 42 }).success, false);
  assert.equal(selfProfileUpdateSchema.safeParse({ firstName: "А".repeat(201) }).success, false);
  const noLast = selfProfileUpdateSchema.parse({ firstName: "Данил" });
  assert.deepEqual(buildSelfProfileUpdate(noLast), { ok: true, data: { displayName: "Данил" } });
  const nullLast = selfProfileUpdateSchema.parse({ firstName: "Данил", lastName: null });
  assert.deepEqual(buildSelfProfileUpdate(nullLast), { ok: true, data: { displayName: "Данил" } });
});

/* ===================================================================== *
 *  Telegram can never revert an edited name
 * ===================================================================== */

test("PROF-P: telegramMetadataFrom — the ONLY columns an existing user's Telegram login writes — has exactly the four telegram* keys and no displayName", () => {
  const metadata = telegramMetadataFrom({ first_name: "Данил", last_name: "Миронович", username: "danil", photo_url: "https://t.me/p.jpg" });
  assert.deepEqual(Object.keys(metadata).sort(), ["telegramFirstName", "telegramLastName", "telegramPhotoUrl", "telegramUsername"]);
  assert.deepEqual(metadata, { telegramUsername: "danil", telegramFirstName: "Данил", telegramLastName: "Миронович", telegramPhotoUrl: "https://t.me/p.jpg" });
  assert.deepEqual(telegramMetadataFrom({ first_name: "Данил" }), { telegramUsername: null, telegramFirstName: "Данил", telegramLastName: null, telegramPhotoUrl: null });
});

test("PROF-Q: THE RESTART SCENARIO — name edited in METRO UP, Mini App reopened: whether or not Telegram's own data changed, the bootstrap's write (exactly the route's `{ ...metadata, lastLoginAt }`) leaves the edited displayName untouched", () => {
  const row = {
    displayName: "Тестовое Имя",
    telegramUsername: "danil",
    telegramFirstName: "Данил",
    telegramLastName: "Миронович",
    telegramPhotoUrl: null as string | null,
  };

  // Reopen with unchanged Telegram data: no write at all.
  const same = telegramMetadataFrom({ first_name: "Данил", last_name: "Миронович", username: "danil" });
  assert.equal(hasTelegramMetadataChanged(row, same), false);

  // Reopen after the user changed their Telegram name/photo: a metadata write happens…
  const changed = telegramMetadataFrom({ first_name: "Даниил", last_name: "Миронович", username: "danil", photo_url: "https://t.me/new.jpg" });
  assert.equal(hasTelegramMetadataChanged(row, changed), true);
  const afterBootstrap = { ...row, ...changed, lastLoginAt: new Date() };
  // …and it still cannot touch the app-owned name.
  assert.equal(afterBootstrap.displayName, "Тестовое Имя");
  assert.equal(afterBootstrap.telegramFirstName, "Даниил");
});

test("PROF-R: initialDisplayNameFrom — used ONLY for a brand-new user — keeps the existing rule (first + last, else first, else «Сотрудник»)", () => {
  assert.equal(initialDisplayNameFrom({ first_name: "Данил", last_name: "Миронович" }), "Данил Миронович");
  assert.equal(initialDisplayNameFrom({ first_name: "Данил" }), "Данил");
  assert.equal(initialDisplayNameFrom({}), "Сотрудник");
});

test("PROF-S (structural): in BOTH Telegram auth routes the existing-user writes spread only `metadata` + lastLoginAt; displayName is written only inside the `create:` branch", () => {
  for (const file of ["src/app/api/auth/telegram/route.ts", "src/app/api/auth/telegram-web/route.ts"]) {
    const code = codeOnly(read(file));
    assert.match(code, /update: \{ \.\.\.metadata, lastLoginAt: new Date\(\) \}/, file);
    const displayNameWrites = code.match(/displayName:/g) ?? [];
    assert.equal(displayNameWrites.length, 1, `${file}: exactly one displayName write`);
    assert.match(code, /create: \{\s*\n\s*telegramId,\s*\n\s*\.\.\.metadata,\s*\n\s*displayName: initialDisplayNameFrom\(/, file);
  }
  const fast = codeOnly(read("src/app/api/auth/telegram/route.ts"));
  assert.match(fast, /data: \{ \.\.\.metadata, lastLoginAt: new Date\(\) \}/, "the fast path's metadata update");
});

/* ===================================================================== *
 *  View As — never edits the preview persona
 * ===================================================================== */

test("PROF-T: canSelfEditProfile — editable with no preview and during a CITY_MANAGER self-preview (the real actor); read-only during a MANAGER/CLUB_MANAGER persona preview — the same rule requireNoActiveViewAs enforces server-side", () => {
  assert.equal(canSelfEditProfile(null), true);
  assert.equal(canSelfEditProfile(undefined), true);
  assert.equal(canSelfEditProfile({ previewRole: "CITY_MANAGER" }), true);
  assert.equal(canSelfEditProfile({ previewRole: "MANAGER" }), false);
  assert.equal(canSelfEditProfile({ previewRole: "CLUB_MANAGER" }), false);
});

test("PROF-U (structural): the server refuses a persona-preview edit twice over — the middleware blocks every PATCH during a persona preview (/api/profile is not allowlisted), and the route itself re-checks with requireNoActiveViewAs before reading the body", () => {
  const middleware = read("src/middleware.ts");
  assert.match(middleware, /const MUTATING_METHODS = new Set\(\["POST", "PUT", "PATCH", "DELETE"\]\);/);
  const allowlist = middleware.slice(middleware.indexOf("const ALLOWLIST"), middleware.indexOf("]);", middleware.indexOf("const ALLOWLIST")));
  assert.doesNotMatch(allowlist, /api\/profile/);
  const route = codeOnly(read("src/app/api/profile/route.ts"));
  const patch = route.slice(route.indexOf("export async function PATCH"));
  const guardIdx = patch.indexOf("await requireNoActiveViewAs(user)");
  const parseIdx = patch.indexOf("selfProfileUpdateSchema.safeParse");
  assert.ok(guardIdx > 0 && parseIdx > guardIdx);
});

/* ===================================================================== *
 *  Self-only identity, access, data access
 * ===================================================================== */

test("PROF-V (structural): /api/profile derives identity ONLY from the session (requireActiveAccess — the same SUSPENDED-blocking rule as the self-only avatar routes) and reads no id from the request at all", () => {
  const route = codeOnly(read("src/app/api/profile/route.ts"));
  assert.equal((route.match(/const user = await requireActiveAccess\(\);/g) ?? []).length, 2, "GET and PATCH");
  assert.doesNotMatch(route, /params|searchParams|nextUrl|userId|employeeId|telegramId/);
  assert.match(route, /updateOwnDisplayName\(user, update\.data\)/);
  const avatar = read("src/app/api/profile/avatar/upload-url/route.ts");
  assert.match(avatar, /requireActiveAccess\(\)/, "same access primitive as the existing self-service avatar route");
});

test("PROF-W (structural): the DB write targets the session user's own row and sets displayName field-by-field (no spread of input), audited as PROFILE_NAME_UPDATED; the employment read uses the open assignment and never User.createdAt", () => {
  const data = codeOnly(read("src/lib/server/self-profile.ts"));
  assert.match(data, /where: \{ id: user\.id \}/);
  assert.match(data, /data: \{ displayName: data\.displayName \}/);
  assert.doesNotMatch(data, /\.\.\.data|\.\.\.input/);
  assert.match(data, /action: "PROFILE_NAME_UPDATED"/);
  assert.match(data, /where: \{ userId, endedAt: null \}/);
  assert.doesNotMatch(data, /createdAt/);
});

test("PROF-X (structural): GET /api/profile reads the effective context so a persona preview gets no employment data (null), never the real actor's", () => {
  const route = codeOnly(read("src/app/api/profile/route.ts"));
  assert.match(route, /employmentStartedAt: effective\.isPreviewing \? null : await loadOpenEmploymentStartedAt\(user\.id\)/);
});

/* ===================================================================== *
 *  Errors and employment display
 * ===================================================================== */

test("PROF-Y: describeProfileSaveError with REAL ApiError instances keeps the five failure classes apart — and never says «Раздел недоступен»", () => {
  const validation = describeProfileSaveError(new ApiError(400, "INVALID_INPUT", { firstName: "Укажите имя", role: "x" }));
  assert.equal(validation.kind, "validation");
  assert.deepEqual(validation.fields, { firstName: "Укажите имя" }, "only the two name fields are surfaced");
  assert.equal(describeProfileSaveError(new ApiError(401, "unauthorized")).kind, "authorization");
  const preview = describeProfileSaveError(new ApiError(403, "VIEW_AS_READ_ONLY"));
  assert.equal(preview.kind, "authorization");
  assert.match(preview.message, /режиме просмотра/);
  assert.equal(describeProfileSaveError(new ApiError(403, "APP_TEMPORARILY_UNAVAILABLE")).kind, "authorization");
  assert.equal(describeProfileSaveError(new ApiError(409, "onboarding_required")).kind, "authorization");
  assert.equal(describeProfileSaveError(new ApiError(429, "rate_limited")).kind, "rate_limited");
  assert.equal(describeProfileSaveError(new ApiError(500, "internal_error")).kind, "server");
  assert.equal(describeProfileSaveError(new ApiError(502, "error")).kind, "server");
  const network = describeProfileSaveError(new TypeError("Failed to fetch"));
  assert.equal(network.kind, "network");
  assert.match(network.message, /соединение/);
  for (const e of [new ApiError(500, "internal_error"), new TypeError("x"), new ApiError(403, "forbidden")]) {
    assert.doesNotMatch(describeProfileSaveError(e).message, /Раздел недоступен/);
  }
});

test("PROF-Z: describeEmployment — no assignment means «Не указано» for BOTH rows (no invented tenure); a real start date gives the date and formatTenureRu's tenure", () => {
  assert.deepEqual(describeEmployment(null), { startDate: NOT_SET_LABEL, tenure: NOT_SET_LABEL });
  const now = new Date("2026-06-15T12:00:00.000Z");
  const started = "2024-03-15T12:00:00.000Z";
  const result = describeEmployment(started, now);
  assert.equal(result.startDate, new Date(started).toLocaleDateString("ru-RU"));
  assert.equal(result.tenure, formatTenureRu(started, now));
  assert.match(result.tenure, /год/);
});

/* ===================================================================== *
 *  Client wiring (supplementary)
 * ===================================================================== */

test("PROF-AA (structural): the client sends only the two allowlisted fields, and saveProfile applies the SERVER-confirmed user the same way saveOnboarding does — an ordinary save, never a context switch", () => {
  const client = read("src/lib/api/client.ts");
  assert.match(client, /body: JSON\.stringify\(\{ firstName: input\.firstName, lastName: input\.lastName \}\)/);
  const provider = read("src/providers/AppUserProvider.tsx");
  const fn = provider.slice(provider.indexOf("const saveProfile = useCallback"), provider.indexOf("const signOut = useCallback"));
  assert.match(fn, /const saved = await updateSelfProfile\(input\);\s*\n\s*setUser\(saved\);/);
  assert.doesNotMatch(codeOnly(fn), /switchContext|confirmIdentity|clearAllQueries/);
});

test("PROF-AB (structural): the Profile page gates BOTH edit affordances (name sheet and photo) on canSelfEditProfile, saves through saveProfile, and never touches the context-transition machinery or the global cache", () => {
  const page = read("src/app/profile/page.tsx");
  assert.match(page, /const canEdit = canSelfEditProfile\(serverUser\?\.viewContext\);/);
  assert.match(page, /open=\{editOpen && canEdit\}/);
  assert.match(page, /open=\{cropOpen && canEdit\}/);
  assert.match(page, /onSave=\{\(parts\) => saveProfile\(\{ firstName: parts\.firstName, lastName: parts\.lastName \}\)\}/);
  const pageCode = codeOnly(page);
  const sheetCode = codeOnly(read("src/components/profile/ProfileEditSheet.tsx"));
  for (const code of [pageCode, sheetCode]) {
    assert.doesNotMatch(code, /switchContext|confirmIdentity|clearAllQueries|ContextTransitionOverlay|ContextRecoveryScreen/);
  }
});

test("PROF-AC (structural): the editor's inputs have real labels and mobile autocomplete, a same-tick double-submit guard, and cannot be dismissed mid-save", () => {
  const sheet = read("src/components/profile/ProfileEditSheet.tsx");
  assert.match(sheet, /<label htmlFor=\{id\}/);
  assert.match(sheet, /autoComplete="given-name"/);
  assert.match(sheet, /autoComplete="family-name"/);
  assert.match(sheet, /if \(inFlight\.current\) return;/);
  assert.match(sheet, /const requestClose = \(\) => \{\s*\n\s*if \(!inFlight\.current\) onClose\(\);/);
  assert.match(sheet, /disabled=\{saving \|\| !dirty\}/);
});
