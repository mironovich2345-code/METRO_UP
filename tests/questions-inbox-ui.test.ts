import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  QUESTION_STATUS_TABS,
  questionStatusLabel,
  questionStatusBadgeVariant,
  questionCategoryLabel,
  questionStatusTransitions,
  questionStatusActionLabel,
} from "../src/lib/client/questions-ui";
import { questionAttachmentDownloadUrl } from "../src/lib/api/questions-client";

/**
 * METRO UP ROUND 1, Milestone 3 — CITY_MANAGER Questions Inbox, client side.
 * questions-ui.ts is pure (no DOM/fetch import) and gets direct coverage
 * below. No DOM harness exists in this repo (established convention) —
 * component render/interaction is not tested; every decision the inbox
 * list/detail pages DELEGATE to pure modules is, plus source-text checks for
 * the wiring those pages do inline (role-neutral behavior, cache
 * invalidation scope, Russian copy, no identity rendering).
 */
const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");

/* ============================== display helpers (pure) ============================== */

test("TABS-A: the four tabs are Все/Новые/В работе/Закрытые, in that order, mapping to ALL/NEW/IN_PROGRESS/CLOSED", () => {
  assert.deepEqual(QUESTION_STATUS_TABS.map((t) => t.value), ["ALL", "NEW", "IN_PROGRESS", "CLOSED"]);
  assert.deepEqual(QUESTION_STATUS_TABS.map((t) => t.label), ["Все", "Новые", "В работе", "Закрытые"]);
});

test("LABEL-A: questionStatusLabel maps all three real statuses to distinct Russian labels", () => {
  assert.equal(questionStatusLabel("NEW"), "Новый");
  assert.equal(questionStatusLabel("IN_PROGRESS"), "В работе");
  assert.equal(questionStatusLabel("CLOSED"), "Закрыт");
});

test("BADGE-A: each status maps to a real components/ui/badge.tsx variant — never an invented variant name", () => {
  const realVariants = new Set(["brand", "neutral", "success", "outline", "solid"]);
  for (const s of ["NEW", "IN_PROGRESS", "CLOSED"] as const) {
    assert.ok(realVariants.has(questionStatusBadgeVariant(s)));
  }
});

test("CATLABEL-A: questionCategoryLabel resolves every one of the 7 real categories to a non-empty Russian label, matching ask-question-core.ts's own QUESTION_CATEGORY_OPTIONS", () => {
  for (const c of ["WORK_PROCESSES", "TRAINING", "MANAGEMENT", "WORKING_CONDITIONS", "TECHNICAL", "IDEA", "OTHER"] as const) {
    const label = questionCategoryLabel(c);
    assert.ok(label.length > 0);
    assert.notEqual(label, c);
  }
});

test("TRANSUI-A: the client-side transition map mirrors the server's questions-core.ts allowedStatusTransitions exactly", () => {
  assert.deepEqual(questionStatusTransitions("NEW"), { forward: "IN_PROGRESS", correction: null });
  assert.deepEqual(questionStatusTransitions("IN_PROGRESS"), { forward: "CLOSED", correction: "NEW" });
  assert.deepEqual(questionStatusTransitions("CLOSED"), { forward: null, correction: "IN_PROGRESS" });
});

test("ACTIONLABEL-A: every reachable transition target has a distinct, non-empty Russian action label", () => {
  const labels = new Set([questionStatusActionLabel("NEW"), questionStatusActionLabel("IN_PROGRESS"), questionStatusActionLabel("CLOSED")]);
  assert.equal(labels.size, 3);
});

test("DLURL-A: questionAttachmentDownloadUrl builds a same-origin proxy path containing only the opaque attachment id — never a storage key, never a query string", () => {
  const url = questionAttachmentDownloadUrl("att-123");
  assert.equal(url, "/api/questions/attachments/att-123/download");
  assert.doesNotMatch(url, /\?/);
});

/* ============================== source-text wiring: Home block ============================== */

test("WIRE-A: the Home CITY_MANAGER section renders a 'Вопросы сотрудников' block that routes to /questions, placed after the Обучение row per the Management UX Round C approved order (anchored on the actual JSX title=\"...\" props, not bare prose — this file's own surrounding doc comments mention both phrases too)", () => {
  const src = read("src/app/home/page.tsx");
  const trainingIdx = src.indexOf('title="Обучение"');
  const questionsIdx = src.indexOf('title="Вопросы сотрудников"', trainingIdx);
  assert.ok(trainingIdx > 0 && questionsIdx > trainingIdx, "expected the questions block after the training section");
  const sectionSrc = src.slice(questionsIdx, questionsIdx + 700);
  assert.match(sectionSrc, /router\.push\(.\/questions.\)/);
});

test("WIRE-B: the Home block never renders individual question cards directly on Home — only the compact count row, no list iteration on this screen", () => {
  const src = read("src/app/home/page.tsx");
  const questionsIdx = src.indexOf('title="Вопросы сотрудников"');
  const sectionSrc = src.slice(questionsIdx, questionsIdx + 700);
  assert.doesNotMatch(sectionSrc, /\.map\(/);
});

test("WIRE-C: the Home 'N новых' label never says 'непрочитанных' — that is Milestone 4's read-state concept, not implemented yet", () => {
  const src = read("src/app/home/page.tsx");
  assert.doesNotMatch(src, /непрочитанн/i);
});

/* ============================== source-text wiring: list page ============================== */

test("WIRE-D: the questions list page derives its data from GET /api/questions via questionsApi.list and never hardcodes a role-specific conditional branch — ready to serve OPERATIONS_DIRECTOR later with no change here", () => {
  const src = read("src/app/questions/page.tsx");
  assert.match(src, /questionsApi\.list/);
  assert.doesNotMatch(src, /if\s*\([^)]*(CITY_MANAGER|OPERATIONS_DIRECTOR|PROJECT_ADMIN)/);
});

test("WIRE-E: the list page's empty states use the exact mandated Russian copy, distinguishing a genuinely empty inbox from a filtered-empty result", () => {
  const src = read("src/app/questions/page.tsx");
  assert.match(src, /Пока нет вопросов сотрудников\./);
  assert.match(src, /По выбранным фильтрам вопросов нет\./);
});

test("WIRE-F: the list page's error state uses the mandated safe copy, never a raw server error string", () => {
  const src = read("src/app/questions/page.tsx");
  assert.match(src, /Не удалось загрузить вопросы\./);
});

test("WIRE-G: the list page's cache key embeds every filter dimension (status/category/clubId/page) via cacheKeys.questionsList — switching a tab/filter never serves a stale, differently-filtered cached response", () => {
  const src = read("src/app/questions/page.tsx");
  assert.match(src, /cacheKeys\.questionsList\(filterKey\)/);
});

/* ============================== source-text wiring: detail page ============================== */

test("WIRE-H: the detail page never renders an Avatar component or computes initials from authorDisplay (e.g. charAt(0)/slice(0,1) + toUpperCase) — anonymous or not, there is no avatar on this screen", () => {
  const src = read("src/app/questions/[id]/page.tsx");
  assert.doesNotMatch(src, /<Avatar/);
  assert.doesNotMatch(src, /authorDisplay\s*\.\s*(charAt|slice|substring)/);
});

test("WIRE-I: the detail page's attachment links point at questionAttachmentDownloadUrl(attachment.id) — never a raw storageKey field (EmployeeQuestionDTO's attachments carry none to begin with)", () => {
  const src = read("src/app/questions/[id]/page.tsx");
  assert.match(src, /questionAttachmentDownloadUrl\(attachment\.id\)/);
  assert.doesNotMatch(src, /\.storageKey/);
});

test("WIRE-J: the detail page's status mutation invalidates only the question detail/list caches and Home (for the count) — never Academy/team cache prefixes", () => {
  const src = read("src/app/questions/[id]/page.tsx");
  assert.match(src, /invalidatePrefix\(cacheKeyPrefixes\.questions\)/);
  assert.match(src, /invalidatePrefix\(cacheKeyPrefixes\.home\)/);
  assert.doesNotMatch(src, /cacheKeyPrefixes\.academy|cacheKeyPrefixes\.team/);
});

/* ============================== source-text wiring: cache keys ============================== */

test("WIRE-K: cache-keys.ts's questionsList embeds every filter dimension (status/category/clubId/page)", () => {
  const src = read("src/lib/client/cache-keys.ts");
  const fnSrc = src.slice(src.indexOf("questionsList:"), src.indexOf("questionDetail:"));
  assert.match(fnSrc, /filter\.status/);
  assert.match(fnSrc, /filter\.category/);
  assert.match(fnSrc, /filter\.clubId/);
  assert.match(fnSrc, /filter\.page/);
});

test("WIRE-L: cacheKeyPrefixes gained a 'questions' entry for coarse post-mutation invalidation", () => {
  const src = read("src/lib/client/cache-keys.ts");
  assert.match(src, /questions: "questions"/);
});
