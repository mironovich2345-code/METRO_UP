import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  EMPLOYMENT_DATE_MESSAGES,
  METROFITNESS_NETWORK_STARTED_ON,
  employmentDateInputValue,
  formatEmploymentDateRu,
  localTodayInputValue,
  parseEmploymentStartDate,
  planEmploymentStartChange,
  startsBeforePreviousAssignment,
} from "../src/lib/employment-date";
import { describeEmployment, NOT_SET_LABEL } from "../src/lib/profile-edit";
import { formatTenureRu } from "../src/lib/cabinet-ui";
import { QUESTION_CATEGORY_OPTIONS } from "../src/lib/client/ask-question-core";
import { switchGeometry, switchThumbLeft } from "../src/lib/switch-geometry";
import { attachmentPreviewKind, canShareFile, describeAttachmentLoadError } from "../src/lib/client/attachment-preview";
import { fetchProtectedBlob } from "../src/lib/api/protected-binary";
import { ApiError } from "../src/lib/api/client";
import {
  canOfferFullAccessGrant,
  classifyFullAccessTarget,
  clubManagerTargetClubIds,
  decideFullAccessGrant,
  type FullAccessGrantInput,
} from "../src/lib/server/rbac/full-access-grant-core";
import { employeeAccessView } from "../src/lib/client/access-grant-ui";
import type { RoleGrant } from "../src/lib/server/rbac/types";

const read = (p: string) => readFileSync(p, "utf8");
/** Source without comments — "must not contain" checks look at code only,
 * never at the doc comments that explain why something is absent. */
const code = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/(^|[^:"'])\/\/.*$/gm, "$1");

/* ===================================================================== *
 *  A. EMPLOYMENT START DATE
 * ===================================================================== */

const NOW = new Date("2026-10-11T09:00:00.000Z");

test("EMP-A: a valid own date parses to that calendar date at UTC midnight", () => {
  const r = parseEmploymentStartDate("2024-08-15", NOW);
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.isoDate, "2024-08-15");
    assert.equal(r.date.toISOString(), "2024-08-15T00:00:00.000Z");
  }
});

test("EMP-B: future dates are rejected; today is accepted in every timezone (UTC+14 tolerance), the day after that is not", () => {
  assert.equal(parseEmploymentStartDate("2026-10-11", NOW).ok, true);
  // 09:00Z + 14h = 23:00Z, still the 11th -> the 12th is future everywhere.
  const tomorrow = parseEmploymentStartDate("2026-10-12", NOW);
  assert.equal(tomorrow.ok, false);
  if (!tomorrow.ok) assert.equal(tomorrow.code, "future_date");
  // At 11:00Z it is already the 12th in UTC+14 -> the 12th is accepted.
  assert.equal(parseEmploymentStartDate("2026-10-12", new Date("2026-10-11T11:00:00.000Z")).ok, true);
  assert.equal(parseEmploymentStartDate("2027-01-01", NOW).ok, false);
});

test("EMP-C: impossible / malformed calendar dates are rejected", () => {
  for (const bad of ["2024-02-30", "2023-02-29", "2024-13-01", "15.08.2024", "2024-8-15", "", "   ", null, 20240815, "2024-08-15T00:00:00Z"]) {
    const r = parseEmploymentStartDate(bad, NOW);
    assert.equal(r.ok, false, String(bad));
  }
  assert.equal(parseEmploymentStartDate("2024-02-29", NOW).ok, true); // real leap day
});

test("EMP-C2 (QA-04.1): the business minimum is the MetroFitness network start, 2015-12-05 — one named constant, enforced server-side and used as the picker's min", () => {
  assert.equal(METROFITNESS_NETWORK_STARTED_ON, "2015-12-05");
  const dayBefore = parseEmploymentStartDate("2015-12-04", NOW);
  assert.equal(dayBefore.ok, false);
  if (!dayBefore.ok) {
    assert.equal(dayBefore.code, "before_network_start");
    assert.equal(dayBefore.message, "Дата начала работы не может быть раньше 5 декабря 2015 года");
  }
  for (const old of ["1970-01-01", "2000-06-15", "2015-11-30"]) assert.equal(parseEmploymentStartDate(old, NOW).ok, false, old);
  assert.equal(parseEmploymentStartDate("2015-12-05", NOW).ok, true);
  assert.equal(parseEmploymentStartDate("2016-01-01", NOW).ok, true);
  // The crafted-request path: the route runs exactly this parser before any write.
  assert.match(read("src/app/api/profile/employment/route.ts"), /const date = parseEmploymentStartDate\(parsed\.data\.startedOn\);\s*\n\s*if \(!date\.ok\) return jsonError\(400, date\.code/);
  // The picker uses the same constant; the date literal lives in one place only.
  assert.match(read("src/components/profile/EmploymentStartSheet.tsx"), /min=\{METROFITNESS_NETWORK_STARTED_ON\}/);
  for (const f of ["src/components/profile/EmploymentStartSheet.tsx", "src/app/api/profile/employment/route.ts", "src/lib/server/self-profile.ts", "src/app/profile/page.tsx"]) {
    assert.doesNotMatch(read(f), /2015-12-05|1970/, f);
  }
  assert.doesNotMatch(read("src/lib/employment-date.ts"), /1970/);
});

test("EMP-D: no timezone shift — the stored date is shown and pre-filled as the same calendar date", () => {
  const stored = "2024-08-15T00:00:00.000Z";
  assert.equal(formatEmploymentDateRu(stored), "15 августа 2024");
  assert.equal(employmentDateInputValue(stored), "2024-08-15");
  assert.equal(employmentDateInputValue(null), "");
  assert.equal(localTodayInputValue(new Date(2026, 0, 5, 23, 30)), "2026-01-05");
});

test("EMP-E: tenure is derived from startedAt and recalculates with it (never User.createdAt; no date -> «Не указано»)", () => {
  assert.deepEqual(describeEmployment(null, NOW), { startDate: NOT_SET_LABEL, tenure: NOT_SET_LABEL });
  const before = describeEmployment("2024-08-15T00:00:00.000Z", NOW);
  const after = describeEmployment("2026-09-01T00:00:00.000Z", NOW);
  assert.equal(before.tenure, formatTenureRu("2024-08-15T00:00:00.000Z", NOW));
  assert.equal(after.tenure, formatTenureRu("2026-09-01T00:00:00.000Z", NOW));
  assert.notEqual(before.tenure, after.tenure);
  assert.doesNotMatch(code("src/lib/server/self-profile.ts"), /createdAt/);
  assert.doesNotMatch(code("src/app/api/profile/employment/route.ts"), /createdAt/);
});

test("EMP-F: historical (closed) assignments are never overwritten — only the open row is updated, by id", () => {
  const date = new Date("2025-03-01T00:00:00.000Z");
  const plan = planEmploymentStartChange({
    isoDate: "2025-03-01",
    date,
    open: { id: "open-row", startedAt: new Date("2025-04-01T00:00:00.000Z") },
    previousEndedAt: new Date("2025-02-28T15:00:00.000Z"),
    profile: { clubId: "club-1", positionId: "CLIENT_MANAGER" },
  });
  assert.deepEqual(plan, { kind: "update", assignmentId: "open-row", previousStartedAt: new Date("2025-04-01T00:00:00.000Z") });
  // The service's update is keyed on that id only; the closed-row lookup is read-only.
  const svc = read("src/lib/server/self-profile.ts");
  assert.match(svc, /tx\.employmentAssignment\.update\(\{\s*where: \{ id: plan\.assignmentId \}/);
  assert.doesNotMatch(svc, /updateMany/);
  assert.match(svc, /where: \{ userId: user\.id, endedAt: null \}/);
});

test("EMP-G: a date before the previous assignment's end is rejected (no overlapping history); a same-day transfer is allowed", () => {
  const prevEnd = new Date("2025-03-10T18:00:00.000Z");
  assert.equal(startsBeforePreviousAssignment("2025-03-09", prevEnd), true);
  assert.equal(startsBeforePreviousAssignment("2025-03-10", prevEnd), false);
  const plan = planEmploymentStartChange({
    isoDate: "2025-03-09",
    date: new Date("2025-03-09T00:00:00.000Z"),
    open: null,
    previousEndedAt: prevEnd,
    profile: { clubId: "c", positionId: "CLIENT_MANAGER" },
  });
  assert.deepEqual(plan, { kind: "reject", code: "before_previous_assignment" });
  assert.ok(EMPLOYMENT_DATE_MESSAGES.before_previous_assignment);
});

test("EMP-H: with no open assignment, one is created from the REAL EmployeeProfile club/position; an unchanged date writes nothing", () => {
  const date = new Date("2024-08-15T00:00:00.000Z");
  assert.deepEqual(
    planEmploymentStartChange({ isoDate: "2024-08-15", date, open: null, previousEndedAt: null, profile: { clubId: "club-7", positionId: "NIGHT_MANAGER" } }),
    { kind: "create", clubId: "club-7", positionId: "NIGHT_MANAGER" },
  );
  assert.deepEqual(
    planEmploymentStartChange({ isoDate: "2024-08-15", date, open: { id: "x", startedAt: date }, previousEndedAt: null, profile: { clubId: "c", positionId: "NIGHT_MANAGER" } }),
    { kind: "noop", startedAt: date },
  );
});

test("EMP-I: the self mutation is session-only — no user/employee id in the schema, body or client call; SUSPENDED and View As are refused", () => {
  const route = read("src/app/api/profile/employment/route.ts");
  assert.match(route, /const user = await requireActiveAccess\(\);/); // SUSPENDED -> 403
  assert.match(route, /await requireNoActiveViewAs\(user\);/); // persona preview -> 403
  assert.match(route, /updateOwnEmploymentStartDate\(user, /);
  assert.doesNotMatch(route, /userId|employeeId|searchParams/);
  const schemas = read("src/lib/server/schemas.ts");
  const schemaSrc = schemas.slice(schemas.indexOf("export const selfEmploymentStartSchema"), schemas.indexOf("export const selfEmploymentStartSchema") + 300);
  assert.match(schemaSrc, /startedOn:/);
  assert.doesNotMatch(schemaSrc, /userId|clubId|endedAt/);
  const client = read("src/lib/api/client.ts");
  assert.match(client, /export async function updateSelfEmploymentStart\(startedOn: string\)/);
  assert.match(client, /body: JSON\.stringify\(\{ startedOn \}\)/);
});

test("EMP-J: real MANAGER / CLUB_MANAGER / CITY_MANAGER all reach the same self-only write (no role gate beyond an EmployeeProfile); a persona preview hides the editor", () => {
  const route = read("src/app/api/profile/employment/route.ts");
  assert.doesNotMatch(route, /requireRole|requireClubManagerAccess|requireSystemAccess|hasActiveRole/);
  const profile = read("src/app/profile/page.tsx");
  assert.match(profile, /onClick: canEdit && selfProfile \? \(\) => setEmploymentOpen\(true\) : undefined/);
  assert.match(profile, /open=\{employmentOpen && canEdit\}/);
});

test("EMP-K: every change is audited in the same transaction (PROFILE_EMPLOYMENT_START_UPDATED, before/after)", () => {
  const svc = read("src/lib/server/self-profile.ts");
  const fn = svc.slice(svc.indexOf("export async function updateOwnEmploymentStartDate"));
  assert.match(fn, /prisma\.\$transaction\(async \(tx\) =>/);
  assert.match(fn, /action: "PROFILE_EMPLOYMENT_START_UPDATED"/);
  assert.match(fn, /before: \{ startedAt: open\?\.startedAt\.toISOString\(\) \?\? null \}/);
});

test("EMP-L: after save the Profile writes the confirmed DTO into its cache (no reload), so date and tenure update at once", () => {
  const profile = read("src/app/profile/page.tsx");
  assert.match(profile, /const updated = await updateSelfEmploymentStart\(startedOn\);\s*\n\s*await setSelfProfile\(updated, \{ revalidate: false \}\);/);
  assert.doesNotMatch(profile, /location\.reload|router\.refresh/);
});

/* ===================================================================== *
 *  B/C. QUESTIONS — category selector + anonymous switch
 * ===================================================================== */

test("Q-A: the exact categories and stored values are preserved", () => {
  assert.deepEqual(QUESTION_CATEGORY_OPTIONS, [
    { value: "WORK_PROCESSES", label: "Работа и процессы" },
    { value: "TRAINING", label: "Обучение" },
    { value: "MANAGEMENT", label: "Руководитель" },
    { value: "WORKING_CONDITIONS", label: "Условия работы" },
    { value: "TECHNICAL", label: "Техническая проблема" },
    { value: "IDEA", label: "Идея / предложение" },
    { value: "OTHER", label: "Другое" },
  ]);
});

test("Q-B: the chips are replaced by ONE SelectField over the same options; choosing only sets the category and closes — text, attachments and the anonymous toggle are separate state; nothing submits", () => {
  const page = read("src/app/questions/ask/page.tsx");
  assert.match(page, /<SelectField\s+label="Категория"\s+value=\{category\}\s+options=\{QUESTION_CATEGORY_OPTIONS\}/);
  assert.match(page, /onChange=\{setCategory\}/);
  assert.doesNotMatch(page, /QUESTION_CATEGORY_OPTIONS\.map/);
  for (const state of ["const [text, setText]", "const [anonymous, setAnonymous]", "const [attachments, setAttachments]"]) {
    assert.ok(page.includes(state), state);
  }
  const field = read("src/components/ui/option-sheet.tsx");
  const pick = field.slice(field.indexOf("onClick={() => {\n                              onChange("));
  assert.match(pick, /onChange\(option\.value\);\s*\n\s*onOpenChange\(false\);/);
  assert.doesNotMatch(code("src/components/ui/option-sheet.tsx"), /submit/);
});

test("Q-C: switch geometry — the thumb stays inside the track: travel = width − thumb − 2·inset, equal insets on all sides", () => {
  const g = switchGeometry();
  assert.deepEqual(g, { trackWidth: 48, trackHeight: 28, thumbSize: 24, inset: 2, travel: 20 });
  assert.equal(switchThumbLeft(g, false), 2);
  assert.equal(switchThumbLeft(g, true) + g.thumbSize + g.inset, g.trackWidth); // right inset == inset
  for (const [w, h, t] of [[52, 32, 28], [44, 24, 20], [60, 30, 26]] as const) {
    const x = switchGeometry(w, h, t);
    assert.equal(switchThumbLeft(x, true) + t + x.inset, w);
    assert.ok(x.travel > 0);
  }
});

test("Q-D: the Switch pins the thumb at an explicit left/top inset and translates by exactly `travel` (the old thumb had no `left`, so it started at the button's centred static position)", () => {
  const sw = read("src/components/ui/switch.tsx");
  assert.match(sw, /left: GEOMETRY\.inset,/);
  assert.match(sw, /top: GEOMETRY\.inset,/);
  assert.match(sw, /translateX\(\$\{checked \? GEOMETRY\.travel : 0\}px\)/);
  assert.doesNotMatch(sw, /translate-x-/);
  const page = read("src/app/questions/ask/page.tsx");
  assert.match(page, /<Switch checked=\{anonymous\} onCheckedChange=\{setAnonymous\}/);
  assert.doesNotMatch(page, /role="switch"/); // the only other switch call site is gone
});

test("Q-E: anonymous semantics are unchanged — OFF identified, ON anonymous, sent as the same `anonymous` flag", () => {
  const page = read("src/app/questions/ask/page.tsx");
  assert.match(page, /const \[anonymous, setAnonymous\] = useState\(false\);/);
  assert.match(page, /buildCreateQuestionPayload\(\{ senderContext, category, text, anonymous, attachments, scopeHint: scopeSelection\.scopeHint \}\)/);
});

/* ===================================================================== *
 *  D. PROTECTED ATTACHMENTS
 * ===================================================================== */

test("ATT-A: image MIME -> image preview path; PDF -> PDF path; anything else unsupported", () => {
  for (const m of ["image/jpeg", "image/jpg", "image/png", "image/webp", "IMAGE/PNG"]) assert.equal(attachmentPreviewKind(m), "image");
  assert.equal(attachmentPreviewKind("application/pdf"), "pdf");
  assert.equal(attachmentPreviewKind("image/gif"), "unsupported");
  assert.equal(attachmentPreviewKind("text/html"), "unsupported");
});

async function withFetch(impl: typeof fetch, fn: () => Promise<void>) {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  try {
    await fn();
  } finally {
    globalThis.fetch = original;
  }
}

test("ATT-B: an authorized request receives the bytes — same-origin credentials, no-store, nothing added to the URL", async () => {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  await withFetch(
    (async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return new Response(new Uint8Array([37, 80, 68, 70]), { status: 200, headers: { "Content-Type": "application/pdf" } });
    }) as unknown as typeof fetch,
    async () => {
      const blob = await fetchProtectedBlob("/api/questions/attachments/att-1/download");
      assert.equal(blob.type, "application/pdf");
      assert.equal(blob.size, 4);
    },
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/api/questions/attachments/att-1/download");
  assert.equal(calls[0].init?.credentials, "same-origin");
  assert.equal(calls[0].init?.cache, "no-store");
});

test("ATT-C: an unauthorized request is denied — the server's 401/403 surfaces as an ApiError (retryable message), never as bytes", async () => {
  for (const [status, code] of [[401, "unauthorized"], [403, "forbidden"]] as const) {
    await withFetch(
      (async () => new Response(JSON.stringify({ error: code }), { status, headers: { "Content-Type": "application/json" } })) as unknown as typeof fetch,
      async () => {
        await assert.rejects(fetchProtectedBlob("/api/questions/attachments/x/download"), (e: unknown) => e instanceof ApiError && e.status === status && e.code === code);
      },
    );
  }
  assert.match(describeAttachmentLoadError(new ApiError(403, "forbidden")), /Нет доступа/);
  assert.match(describeAttachmentLoadError(new TypeError("network")), /Не удалось загрузить/);
});

test("ATT-D: only same-origin /api/ paths without a query string are fetched (no auth data can be put in a URL)", async () => {
  let called = false;
  await withFetch(
    (async () => {
      called = true;
      return new Response("");
    }) as unknown as typeof fetch,
    async () => {
      for (const bad of ["https://evil.example/x", "//evil.example/api/x", "/api/x?token=abc", "/storage/questions/u/f.pdf"]) {
        await assert.rejects(fetchProtectedBlob(bad), (e: unknown) => e instanceof ApiError && e.code === "invalid_protected_path");
      }
    },
  );
  assert.equal(called, false);
});

test("ATT-E: no direct browser navigation to the protected endpoint — no <a href>/target=_blank/window.open/openLink on the question screen; rows are buttons opening the in-app viewer", () => {
  const page = read("src/app/questions/[id]/page.tsx");
  assert.doesNotMatch(code("src/app/questions/[id]/page.tsx"), /<a\s|target="_blank"|window\.open|openLink/);
  assert.match(page, /<AttachmentRow key=\{a\.id\} attachment=\{a\} onOpen=\{\(\) => setViewing\(a\)\} \/>/);
  const viewer = read("src/components/questions/AttachmentViewer.tsx");
  assert.match(viewer, /useProtectedObjectUrl\(questionAttachmentDownloadUrl\(attachment\.id\), attempt\)/);
  assert.doesNotMatch(code("src/components/questions/AttachmentViewer.tsx"), /window\.open|openLink|target="_blank"/);
  // The PDF fallback link points at the object URL of already-authorized bytes, never the API path.
  assert.match(viewer, /<a\s+href=\{url\}\s+download=\{name\}/);
});

test("ATT-F: object URLs are revoked on close/unmount and in-flight requests aborted", () => {
  const hook = read("src/lib/client/use-protected-object-url.ts");
  assert.match(hook, /URL\.createObjectURL\(blob\)/);
  assert.match(hook, /return \(\) => \{\s*\n\s*controller\.abort\(\);\s*\n\s*if \(objectUrl\) URL\.revokeObjectURL\(objectUrl\);/);
  // The viewer panel (and with it the hook) unmounts when `attachment` becomes null.
  const viewer = read("src/components/questions/AttachmentViewer.tsx");
  assert.match(viewer, /\{attachment && <ViewerPanel key=\{attachment\.id\}/);
});

test("ATT-G: an anonymous question's attachment does not reveal its author — the client path is the opaque attachment id, no storageKey/author field is read, and the server route stays authenticated", () => {
  for (const f of ["src/components/questions/AttachmentViewer.tsx", "src/lib/client/use-protected-object-url.ts", "src/lib/api/protected-binary.ts", "src/app/questions/[id]/page.tsx"]) {
    assert.doesNotMatch(code(f), /storageKey|authorUserId|Content-Disposition/, f);
  }
  const route = read("src/app/api/questions/attachments/[attachmentId]/download/route.ts");
  assert.match(route, /const user = await requireActiveAccess\(\);/);
  assert.match(route, /getQuestionAttachmentForDownload\(actor, attachmentId\)/);
});

test("ATT-H: PDF sharing is feature-detected, never assumed", () => {
  const file = { name: "a.pdf" } as unknown as File;
  assert.equal(canShareFile(undefined, file), false);
  assert.equal(canShareFile({}, file), false);
  assert.equal(canShareFile({ canShare: () => true }, file), true);
  assert.equal(canShareFile({ canShare: () => { throw new Error("x"); } }, file), false);
});

/* ===================================================================== *
 *  E. SCOPED FULL ACCESS
 * ===================================================================== */

const g = (role: RoleGrant["role"], scopeType: RoleGrant["scopeType"], ids: { cityId?: string; clubId?: string } = {}, status: RoleGrant["status"] = "ACTIVE"): RoleGrant => ({
  id: `${role}-${ids.clubId ?? ids.cityId ?? "sys"}`,
  role,
  scopeType,
  cityId: ids.cityId ?? null,
  clubId: ids.clubId ?? null,
  status,
});

function input(over: Partial<FullAccessGrantInput>): FullAccessGrantInput {
  return {
    actorUserId: "actor",
    actorAccessStatus: "FULL",
    viewAsActive: false,
    actorClubManagerClubIds: [],
    actorCityManagerClubIds: [],
    targetUserId: "target",
    targetKind: "EMPLOYEE",
    targetClubId: "club-a",
    targetManagedClubIds: ["club-a"],
    targetAccessStatus: "LIMITED",
    ...over,
  };
}

const CLUB_MGR = { actorClubManagerClubIds: ["club-a"] };
const CITY_MGR = { actorAccessStatus: null, actorCityManagerClubIds: ["club-a", "club-b"] };

test("ACC-A: CLUB_MANAGER own club -> allow (via CLUB_MANAGER)", () => {
  assert.deepEqual(decideFullAccessGrant(input(CLUB_MGR)), { ok: true, via: "CLUB_MANAGER", alreadyFull: false });
});

test("ACC-B: CLUB_MANAGER foreign club -> deny; a forged target id in another club never widens scope", () => {
  assert.deepEqual(decideFullAccessGrant(input({ ...CLUB_MGR, targetClubId: "club-z" })), { ok: false, status: 403, code: "target_out_of_scope" });
});

test("ACC-C: self -> deny (CLUB_MANAGER and CITY_MANAGER alike)", () => {
  assert.equal(decideFullAccessGrant(input({ ...CLUB_MGR, targetUserId: "actor" })).ok, false);
  assert.deepEqual(decideFullAccessGrant(input({ ...CITY_MGR, targetUserId: "actor" })), { ok: false, status: 403, code: "self_target" });
});

test("ACC-D: CLUB_MANAGER may not grant to another CLUB_MANAGER, a CITY_MANAGER, an OPERATIONS_DIRECTOR or a PROJECT_ADMIN", () => {
  for (const targetKind of ["CLUB_MANAGER", "CITY_MANAGER", "OPERATIONS_DIRECTOR", "PROJECT_ADMIN", "OTHER"] as const) {
    assert.deepEqual(decideFullAccessGrant(input({ ...CLUB_MGR, targetKind })), { ok: false, status: 403, code: "target_role_not_allowed" }, targetKind);
  }
});

test("ACC-E: CITY_MANAGER own-scope employee -> allow (via CITY_MANAGER)", () => {
  assert.deepEqual(decideFullAccessGrant(input({ ...CITY_MGR, targetClubId: "club-b", targetManagedClubIds: ["club-b"] })), { ok: true, via: "CITY_MANAGER", alreadyFull: false });
});

test("ACC-F: CITY_MANAGER own-scope CLUB_MANAGER -> allow; a CLUB_MANAGER who also manages a club OUTSIDE the scope -> deny", () => {
  assert.deepEqual(decideFullAccessGrant(input({ ...CITY_MGR, targetKind: "CLUB_MANAGER", targetManagedClubIds: ["club-a", "club-b"] })), { ok: true, via: "CITY_MANAGER", alreadyFull: false });
  assert.deepEqual(decideFullAccessGrant(input({ ...CITY_MGR, targetKind: "CLUB_MANAGER", targetManagedClubIds: ["club-a", "club-z"] })), { ok: false, status: 403, code: "target_out_of_scope" });
});

test("ACC-G: CITY_MANAGER foreign scope -> deny", () => {
  assert.deepEqual(decideFullAccessGrant(input({ ...CITY_MGR, targetClubId: "club-z", targetManagedClubIds: ["club-z"] })), { ok: false, status: 403, code: "target_out_of_scope" });
  assert.deepEqual(decideFullAccessGrant(input({ ...CITY_MGR, targetKind: "CLUB_MANAGER", targetClubId: "club-z", targetManagedClubIds: ["club-z"] })), { ok: false, status: 403, code: "target_out_of_scope" });
});

test("ACC-H: CITY_MANAGER target CITY_MANAGER / PROJECT_ADMIN / OPERATIONS_DIRECTOR -> deny", () => {
  for (const targetKind of ["CITY_MANAGER", "PROJECT_ADMIN", "OPERATIONS_DIRECTOR"] as const) {
    assert.deepEqual(decideFullAccessGrant(input({ ...CITY_MGR, targetKind })), { ok: false, status: 403, code: "target_role_not_allowed" }, targetKind);
  }
});

test("ACC-I: PENDING_APPROVAL -> FULL and LIMITED -> FULL are allowed; FULL is already done (no write); SUSPENDED is never un-suspended by this action", () => {
  assert.deepEqual(decideFullAccessGrant(input({ ...CLUB_MGR, targetAccessStatus: "PENDING_APPROVAL" })), { ok: true, via: "CLUB_MANAGER", alreadyFull: false });
  assert.deepEqual(decideFullAccessGrant(input({ ...CLUB_MGR, targetAccessStatus: "LIMITED" })), { ok: true, via: "CLUB_MANAGER", alreadyFull: false });
  const full = decideFullAccessGrant(input({ ...CLUB_MGR, targetAccessStatus: "FULL" }));
  assert.deepEqual(full, { ok: true, via: "CLUB_MANAGER", alreadyFull: true });
  assert.equal(canOfferFullAccessGrant(full), false);
  assert.deepEqual(decideFullAccessGrant(input({ ...CLUB_MGR, targetAccessStatus: "SUSPENDED" })), { ok: false, status: 409, code: "target_suspended" });
});

test("ACC-J: View As (any preview) -> every access mutation denied; a restricted actor (own LIMITED/PENDING/SUSPENDED profile) -> denied", () => {
  assert.deepEqual(decideFullAccessGrant(input({ ...CLUB_MGR, viewAsActive: true })), { ok: false, status: 403, code: "VIEW_AS_READ_ONLY" });
  assert.deepEqual(decideFullAccessGrant(input({ ...CITY_MGR, viewAsActive: true })), { ok: false, status: 403, code: "VIEW_AS_READ_ONLY" });
  for (const s of ["LIMITED", "PENDING_APPROVAL", "SUSPENDED"] as const) {
    assert.deepEqual(decideFullAccessGrant(input({ ...CLUB_MGR, actorAccessStatus: s })), { ok: false, status: 403, code: "actor_access_restricted" });
  }
});

test("ACC-K: out-of-scope is decided before status, so a foreign employee's access state is never revealed", () => {
  assert.equal(decideFullAccessGrant(input({ ...CLUB_MGR, targetClubId: "club-z", targetAccessStatus: "SUSPENDED" })).ok === false &&
    (decideFullAccessGrant(input({ ...CLUB_MGR, targetClubId: "club-z", targetAccessStatus: "SUSPENDED" })) as { code: string }).code, "target_out_of_scope");
});

test("ACC-L: target classification takes the most privileged role; legacy ADMIN counts as PROJECT_ADMIN; ended grants are ignored", () => {
  assert.equal(classifyFullAccessTarget("EMPLOYEE", []), "EMPLOYEE");
  assert.equal(classifyFullAccessTarget("EMPLOYEE", [g("MANAGER", "CLUB", { clubId: "club-a" })]), "EMPLOYEE");
  assert.equal(classifyFullAccessTarget("CLUB_MANAGER", []), "CLUB_MANAGER");
  assert.equal(classifyFullAccessTarget("EMPLOYEE", [g("CLUB_MANAGER", "CLUB", { clubId: "club-a" })]), "CLUB_MANAGER");
  assert.equal(classifyFullAccessTarget("EMPLOYEE", [g("CLUB_MANAGER", "CLUB", { clubId: "a" }), g("CITY_MANAGER", "CITY", { cityId: "n" })]), "CITY_MANAGER");
  assert.equal(classifyFullAccessTarget("EMPLOYEE", [g("OPERATIONS_DIRECTOR", "NETWORK")]), "OPERATIONS_DIRECTOR");
  assert.equal(classifyFullAccessTarget("EMPLOYEE", [g("PROJECT_ADMIN", "SYSTEM")]), "PROJECT_ADMIN");
  assert.equal(classifyFullAccessTarget("ADMIN", []), "PROJECT_ADMIN");
  assert.equal(classifyFullAccessTarget("SPM", []), "OTHER");
  assert.equal(classifyFullAccessTarget("EMPLOYEE", [g("CITY_MANAGER", "CITY", { cityId: "n" }, "ENDED")]), "EMPLOYEE");
  assert.deepEqual(clubManagerTargetClubIds("club-a", [g("CLUB_MANAGER", "CLUB", { clubId: "club-b" }), g("CLUB_MANAGER", "CLUB", { clubId: "club-c" }, "ENDED")]).sort(), ["club-a", "club-b"]);
});

test("ACC-M: the write reuses the existing club-plan transitions (conditional on the authorized status, audited ACCESS_GRANTED with actor/target/before/after/club/city/via) — no parallel access model", () => {
  const svc = read("src/lib/server/rbac/full-access-grant.ts");
  assert.match(svc, /applyPendingApprovalTx\(tx, \{ \.\.\.audit, toStatus: "FULL", createManagerGrant: target\.kind === "EMPLOYEE" \}\)/);
  assert.match(svc, /applyAccessStatusChangeTx\(tx, \{ \.\.\.audit, before: target\.accessStatus, after: "FULL" \}\)/);
  assert.match(svc, /metadata: \{ source: "scoped_full_access", via: decision\.via, targetKind: target\.kind \}/);
  assert.match(svc, /cityId: target\.cityId/);
  assert.match(svc, /resolveViewContext\(realUser\)/);
  const plan = read("src/lib/server/club-plan.ts");
  assert.match(plan, /where: \{ userId: params\.targetUserId, \.\.\.\(params\.before \? \{ accessStatus: params\.before \} : \{\}\) \}/);
  assert.match(plan, /where: \{ userId: targetUserId, accessStatus: "PENDING_APPROVAL" \}/);
  assert.match(plan, /action: resolveAccessAuditAction\(params\.before, params\.after\)/);
  const route = read("src/app/api/control/team/[id]/grant-full/route.ts");
  assert.match(route, /return jsonOk\(await grantFullAccess\(user, id\)\);/);
  assert.doesNotMatch(route, /readJson|searchParams/); // no body/query input at all
});

test("ACC-N: Employee Card shows «Выдать полный доступ» only for PENDING_APPROVAL/LIMITED with server permission; FULL shows «Полный доступ»; SUSPENDED gets no generic action", () => {
  assert.deepEqual(employeeAccessView({ status: "LIMITED", canGrantFull: true }), { label: "Базовый доступ", showGrant: true });
  assert.deepEqual(employeeAccessView({ status: "PENDING_APPROVAL", canGrantFull: true }), { label: "Ожидает подтверждения", showGrant: true });
  assert.deepEqual(employeeAccessView({ status: "LIMITED", canGrantFull: false }), { label: "Базовый доступ", showGrant: false });
  assert.deepEqual(employeeAccessView({ status: "FULL", canGrantFull: true }), { label: "Полный доступ", showGrant: false });
  assert.deepEqual(employeeAccessView({ status: "SUSPENDED", canGrantFull: true }), { label: "Доступ приостановлен", showGrant: false });
  const page = read("src/app/team/employee/page.tsx");
  assert.match(page, /await mutate\(\{ \.\.\.data, access: \{ status: "FULL", canGrantFull: false \} \}, \{ revalidate: false \}\);/);
});
