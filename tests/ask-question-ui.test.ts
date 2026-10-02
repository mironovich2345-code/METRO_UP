import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  QUESTION_CATEGORY_OPTIONS,
  QUESTION_TEXT_MAX_LENGTH,
  MAX_QUESTION_ATTACHMENTS,
  QUESTION_ATTACHMENT_MAX_BYTES,
  validateQuestionText,
  validateAttachmentFile,
  remainingAttachmentSlots,
  resolveSenderContext,
  resolveScopeHint,
  buildCreateQuestionPayload,
  isSubmitDisabled,
  canShowAskQuestionEntry,
  type AttachmentDraft,
} from "../src/lib/client/ask-question-core";

/**
 * METRO UP ROUND 1, Milestone 2B — Ask Question UI. ask-question-core.ts is
 * pure (no DOM/fetch import) and gets real, direct coverage below. No DOM
 * harness exists in this repo (established convention, see cabinet-ui.
 * test.ts) — component render/interaction is not tested; every decision
 * the component DELEGATES to this pure module is.
 */
const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");

function makeAttachment(overrides: Partial<AttachmentDraft> = {}): AttachmentDraft {
  return {
    localId: "draft-1",
    file: { name: "photo.jpg" } as File,
    status: "done",
    storageKey: "questions/user-1/abc.jpg",
    errorMessage: null,
    ...overrides,
  };
}

/* ============================== category mapping ============================== */

test("CAT-A: all 7 backend categories are represented with Russian labels, in the exact order the task specifies", () => {
  assert.deepEqual(
    QUESTION_CATEGORY_OPTIONS.map((o) => o.value),
    ["WORK_PROCESSES", "TRAINING", "MANAGEMENT", "WORKING_CONDITIONS", "TECHNICAL", "IDEA", "OTHER"],
  );
  assert.deepEqual(
    QUESTION_CATEGORY_OPTIONS.map((o) => o.label),
    ["Работа и процессы", "Обучение", "Руководитель", "Условия работы", "Техническая проблема", "Идея / предложение", "Другое"],
  );
});

/* ============================== text validation ============================== */

test("TEXT-A: empty text is rejected", () => {
  assert.equal(validateQuestionText("").ok, false);
});

test("TEXT-B: whitespace-only text is rejected", () => {
  assert.equal(validateQuestionText("   \n\t  ").ok, false);
});

test("TEXT-C: real text is accepted", () => {
  assert.equal(validateQuestionText("Когда следующее обучение?").ok, true);
});

test("TEXT-D: text at exactly the max length is accepted; one character over is rejected — matches the server's own 4000-char limit, never a smaller client-invented cap", () => {
  assert.equal(QUESTION_TEXT_MAX_LENGTH, 4000);
  assert.equal(validateQuestionText("a".repeat(4000)).ok, true);
  assert.equal(validateQuestionText("a".repeat(4001)).ok, false);
});

/* ============================== attachment validation ============================== */

test("ATTVAL-A: jpg/png/webp/pdf within 10 MB are accepted", () => {
  for (const type of ["image/jpeg", "image/png", "image/webp", "application/pdf"]) {
    assert.equal(validateAttachmentFile({ type, size: 1_000_000 }).ok, true);
  }
});

test("ATTVAL-B: an unsupported type (e.g. executable) is rejected", () => {
  const result = validateAttachmentFile({ type: "application/x-msdownload", size: 1000 });
  assert.equal(result.ok, false);
});

test("ATTVAL-C: a file over 10 MB is rejected", () => {
  assert.equal(QUESTION_ATTACHMENT_MAX_BYTES, 10 * 1024 * 1024);
  const result = validateAttachmentFile({ type: "application/pdf", size: 11 * 1024 * 1024 });
  assert.equal(result.ok, false);
});

test("ATTVAL-D: a zero-byte file is rejected", () => {
  assert.equal(validateAttachmentFile({ type: "image/jpeg", size: 0 }).ok, false);
});

test("ATTVAL-E: a file exactly at the 10 MB boundary is accepted", () => {
  assert.equal(validateAttachmentFile({ type: "image/jpeg", size: 10 * 1024 * 1024 }).ok, true);
});

/* ============================== attachment limit ============================== */

test("ATTLIM-A: with 0 attachments, 5 slots remain (MAX_QUESTION_ATTACHMENTS === 5)", () => {
  assert.equal(MAX_QUESTION_ATTACHMENTS, 5);
  assert.equal(remainingAttachmentSlots([]), 5);
});

test("ATTLIM-B: with 5 attachments already present, 0 slots remain — the 6th is rejected", () => {
  const five = Array.from({ length: 5 }, (_, i) => ({ localId: `d-${i}` }));
  assert.equal(remainingAttachmentSlots(five), 0);
});

test("ATTLIM-C: with 3 attachments present, exactly 2 slots remain", () => {
  const three = Array.from({ length: 3 }, (_, i) => ({ localId: `d-${i}` }));
  assert.equal(remainingAttachmentSlots(three), 2);
});

/* ============================== sender context resolution ============================== */

test("CTX-A: no stored context (fresh user, never visited Home) defaults to MANAGER", () => {
  assert.equal(resolveSenderContext(null), "MANAGER");
});

test("CTX-B: Home's 'PERSONAL' context maps to this domain's 'MANAGER' sender context", () => {
  assert.equal(resolveSenderContext({ type: "PERSONAL" }), "MANAGER");
});

test("CTX-C: Home's 'CLUB_MANAGER' context maps directly to 'CLUB_MANAGER'", () => {
  assert.equal(resolveSenderContext({ type: "CLUB_MANAGER", clubId: "club-1" }), "CLUB_MANAGER");
});

test("CTX-D: Home's 'CITY_MANAGER' context maps directly to 'CITY_MANAGER' — no scope-guessing happens here at all (the snapshot itself comes from EmployeeProfile server-side, never from 'which of several scopes')", () => {
  assert.equal(resolveSenderContext({ type: "CITY_MANAGER" }), "CITY_MANAGER");
});

/* ============================== scope hint (Milestone 2B.1, section B) ============================== */

test("HINT-A: a CLUB_MANAGER's stored clubId becomes the scope hint", () => {
  assert.deepEqual(resolveScopeHint({ type: "CLUB_MANAGER", clubId: "club-1" }), { clubId: "club-1" });
});

test("HINT-B: a CITY_MANAGER's stored context carries no hint today (Home has no per-scope disambiguation yet) — undefined, never a guessed value", () => {
  assert.equal(resolveScopeHint({ type: "CITY_MANAGER" }), undefined);
});

test("HINT-C: PERSONAL and null both produce no hint", () => {
  assert.equal(resolveScopeHint({ type: "PERSONAL" }), undefined);
  assert.equal(resolveScopeHint(null), undefined);
});

test("HINT-D: buildCreateQuestionPayload includes scopeHint only when provided, never an empty object as a false-positive hint", () => {
  const withHint = buildCreateQuestionPayload({ senderContext: "CLUB_MANAGER", category: "OTHER", text: "x", anonymous: false, attachments: [], scopeHint: { clubId: "club-1" } });
  const withoutHint = buildCreateQuestionPayload({ senderContext: "MANAGER", category: "OTHER", text: "x", anonymous: false, attachments: [] });
  assert.deepEqual(withHint.scopeHint, { clubId: "club-1" });
  assert.equal("scopeHint" in withoutHint, false);
});

/* ============================== entry visibility (Milestone 2B.1, section A) ============================== */

test("ENTRY-VIS-A: MANAGER (PERSONAL context, FULL access) sees the entry", () => {
  assert.equal(canShowAskQuestionEntry("PERSONAL", "FULL"), true);
});

test("ENTRY-VIS-B: CLUB_MANAGER context sees the entry", () => {
  assert.equal(canShowAskQuestionEntry("CLUB_MANAGER", "FULL"), true);
});

test("ENTRY-VIS-C: CITY_MANAGER context sees the entry", () => {
  assert.equal(canShowAskQuestionEntry("CITY_MANAGER", "FULL"), true);
});

test("ENTRY-VIS-D: PENDING_APPROVAL does NOT see the entry, regardless of context", () => {
  assert.equal(canShowAskQuestionEntry("PERSONAL", "PENDING_APPROVAL"), false);
  assert.equal(canShowAskQuestionEntry("CITY_MANAGER", "PENDING_APPROVAL"), false);
});

test("ENTRY-VIS-E: an OPERATIONS_DIRECTOR-only context does NOT see the entry, even with FULL access", () => {
  assert.equal(canShowAskQuestionEntry("OPERATIONS_DIRECTOR", "FULL"), false);
});

test("ENTRY-VIS-F: a PROJECT_ADMIN-only context does NOT see the entry, even with FULL access", () => {
  assert.equal(canShowAskQuestionEntry("PROJECT_ADMIN", "FULL"), false);
});

test("ENTRY-VIS-G: SUSPENDED does NOT see the entry (defensive — unreachable today, AccessStatusGate blocks Profile entirely for SUSPENDED, but the allowlist still holds if that ever changes)", () => {
  assert.equal(canShowAskQuestionEntry("PERSONAL", "SUSPENDED"), false);
});

test("ENTRY-VIS-H: LIMITED access with a supported context still sees the entry (only PENDING_APPROVAL/SUSPENDED are excluded by access status)", () => {
  assert.equal(canShowAskQuestionEntry("PERSONAL", "LIMITED"), true);
});

test("ENTRY-VIS-I: no stored context yet (fresh session) defaults to visible — consistent with resolveSenderContext's own MANAGER default, so the entry's visibility never contradicts what submitting would actually do", () => {
  assert.equal(canShowAskQuestionEntry(null, "FULL"), true);
});

/* ============================== submit payload shape ============================== */

test("PAYLOAD-A: the built payload has EXACTLY the five documented fields — no userId/cityId/clubId/authorUserId anywhere", () => {
  const payload = buildCreateQuestionPayload({ senderContext: "MANAGER", category: "TRAINING", text: "  Вопрос  ", anonymous: true, attachments: [] });
  assert.deepEqual(Object.keys(payload).sort(), ["anonymous", "attachments", "category", "senderContext", "text"]);
  const serialized = JSON.stringify(payload);
  for (const forbidden of ["userId", "cityId", "clubId", "authorUserId"]) {
    assert.doesNotMatch(serialized, new RegExp(forbidden));
  }
});

test("PAYLOAD-B: the text field is trimmed", () => {
  const payload = buildCreateQuestionPayload({ senderContext: "MANAGER", category: "OTHER", text: "  hello  ", anonymous: false, attachments: [] });
  assert.equal(payload.text, "hello");
});

test("PAYLOAD-C: the anonymous flag passes through exactly as given, both true and false", () => {
  const t = buildCreateQuestionPayload({ senderContext: "MANAGER", category: "OTHER", text: "x", anonymous: true, attachments: [] });
  const f = buildCreateQuestionPayload({ senderContext: "MANAGER", category: "OTHER", text: "x", anonymous: false, attachments: [] });
  assert.equal(t.anonymous, true);
  assert.equal(f.anonymous, false);
});

test("PAYLOAD-D: only successfully-uploaded ('done') attachments are included — an 'uploading' or 'error' draft is silently excluded, never submitted half-broken", () => {
  const payload = buildCreateQuestionPayload({
    senderContext: "CLUB_MANAGER",
    category: "TECHNICAL",
    text: "x",
    anonymous: false,
    attachments: [
      makeAttachment({ localId: "a", status: "done", storageKey: "questions/user-1/a.jpg" }),
      makeAttachment({ localId: "b", status: "uploading", storageKey: null }),
      makeAttachment({ localId: "c", status: "error", storageKey: null }),
    ],
  });
  assert.equal(payload.attachments.length, 1);
  assert.equal(payload.attachments[0].storageKey, "questions/user-1/a.jpg");
});

test("PAYLOAD-E: included attachments carry only storageKey + originalName — never the File object, mimeType, or sizeBytes", () => {
  const payload = buildCreateQuestionPayload({
    senderContext: "MANAGER",
    category: "OTHER",
    text: "x",
    anonymous: false,
    attachments: [makeAttachment({ file: { name: "report.pdf" } as File })],
  });
  assert.deepEqual(Object.keys(payload.attachments[0]).sort(), ["originalName", "storageKey"]);
  assert.equal(payload.attachments[0].originalName, "report.pdf");
});

test("PAYLOAD-F: senderContext and category pass through unchanged for every valid combination", () => {
  for (const ctx of ["MANAGER", "CLUB_MANAGER", "CITY_MANAGER"] as const) {
    const payload = buildCreateQuestionPayload({ senderContext: ctx, category: "IDEA", text: "x", anonymous: false, attachments: [] });
    assert.equal(payload.senderContext, ctx);
    assert.equal(payload.category, "IDEA");
  }
});

/* ============================== double-submit / submit gating ============================== */

test("SUBMIT-A: already submitting -> disabled, even with otherwise-valid state", () => {
  assert.equal(isSubmitDisabled({ submitting: true, text: "valid text", attachments: [] }), true);
});

test("SUBMIT-B: empty text -> disabled", () => {
  assert.equal(isSubmitDisabled({ submitting: false, text: "", attachments: [] }), true);
});

test("SUBMIT-C: an attachment still uploading -> disabled ('do not silently submit an incomplete question')", () => {
  assert.equal(isSubmitDisabled({ submitting: false, text: "valid", attachments: [makeAttachment({ status: "uploading" })] }), true);
});

test("SUBMIT-D: an attachment in an error state -> disabled until removed or retried", () => {
  assert.equal(isSubmitDisabled({ submitting: false, text: "valid", attachments: [makeAttachment({ status: "error" })] }), true);
});

test("SUBMIT-E: valid text, no attachments -> NOT disabled", () => {
  assert.equal(isSubmitDisabled({ submitting: false, text: "valid", attachments: [] }), false);
});

test("SUBMIT-F: valid text, all attachments done -> NOT disabled", () => {
  assert.equal(isSubmitDisabled({ submitting: false, text: "valid", attachments: [makeAttachment({ status: "done" }), makeAttachment({ localId: "d-2", status: "done" })] }), false);
});

/* ============================== source-text: entry point + no-spoof wiring ============================== */

test("ENTRY-A: Profile has a 'Задать вопрос' entry point routing to /questions/ask", () => {
  const src = read("src/app/profile/page.tsx");
  assert.match(src, /Задать вопрос/);
  assert.match(src, /router\.push\(.\/questions\/ask.\)/);
});

test("ENTRY-B: the entry point is NOT gated behind isAdmin/canSpm or any role check — available to every onboarded employee", () => {
  const src = read("src/app/profile/page.tsx");
  const entryIdx = src.indexOf("Задать вопрос");
  const precedingSrc = src.slice(Math.max(0, entryIdx - 400), entryIdx);
  assert.doesNotMatch(precedingSrc, /\{isAdmin &&|\{canSpm &&/);
});

test("WIRING-A: the Ask Question page never references a client-side userId/cityId/clubId field when building its submission", () => {
  const src = read("src/app/questions/ask/page.tsx");
  assert.doesNotMatch(src, /userId:|cityId:|clubId:/);
});

test("WIRING-B: the Ask Question page resolves sender context via home-context-storage.ts's loadStoredContext, never a hardcoded role or a free-text client field", () => {
  const src = read("src/app/questions/ask/page.tsx");
  assert.match(src, /loadStoredContext\(getOwnerKey\(\)\)/);
  assert.match(src, /resolveSenderContext\(/);
});

test("WIRING-C: attachment uploads go through questionsApi's signed-PUT flow (requestAttachmentUpload + uploadAttachmentBlob), never a direct multipart POST to our own server", () => {
  const src = read("src/app/questions/ask/page.tsx");
  assert.match(src, /questionsApi\.requestAttachmentUpload/);
  assert.match(src, /questionsApi\.uploadAttachmentBlob/);
});

test("WIRING-D: storageKey is never rendered in the UI text — only filename/type/status", () => {
  const src = read("src/app/questions/ask/page.tsx");
  // storageKey is referenced only in state plumbing (ticket.storageKey,
  // a.storageKey assignment) — never interpolated into JSX text content.
  assert.doesNotMatch(src, />\{[^}]*storageKey[^}]*\}</);
});
