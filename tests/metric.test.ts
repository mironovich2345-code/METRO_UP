import { test } from "node:test";
import assert from "node:assert/strict";
import { scopeForSource, positionAllows, retrievalFilter } from "../src/lib/server/metric/access";
import { buildScriptDoc, buildInstructionDoc, buildLessonDoc } from "../src/lib/server/metric/documents";
import { parseResponsePayload } from "../src/lib/server/metric/openai-parse";
import { checkMetricRate, _resetMetricRate } from "../src/lib/server/metric/rate-limit";
import { buildSystemInstructions } from "../src/lib/server/metric/instructions";
import type { ScriptDetailDTO, InstructionDetailDTO } from "../src/lib/api/knowledge-types";
import type { LessonBlockDTO } from "../src/lib/api/content-types";

/**
 * Metric AI v1. Pure logic (access filtering, document building, response
 * parsing, rate limit, instructions) is unit-tested here. DB/HTTP/OpenAI
 * scenarios are explicit integration skips — no real OpenAI call runs in the
 * suite (see the manual smoke-test checklist in the final report).
 */

/* --------------------------- access / scope ----------------------------- */

test("D/P: scripts are SALES-scoped; retrieval filter respects the position gate", () => {
  assert.equal(scopeForSource("SCRIPT"), "SALES");
  assert.equal(scopeForSource("ACADEMY"), "ALL");
  assert.equal(scopeForSource("INSTRUCTION"), "ALL");

  // ADMINISTRATOR (no script access) never sees SALES content.
  assert.equal(positionAllows("ADMINISTRATOR", "SALES"), false);
  assert.equal(positionAllows("ADMINISTRATOR", "ALL"), true);
  assert.equal(positionAllows("CLIENT_MANAGER", "SALES"), true);
  assert.equal(positionAllows("NIGHT_MANAGER", "SALES"), true);

  // The vector-store filter for a non-sales position is ALL-only.
  assert.deepEqual(retrievalFilter("ADMINISTRATOR"), { type: "eq", key: "positionScope", value: "ALL" });
  // Sales positions may also see SALES.
  const f = retrievalFilter("CLIENT_MANAGER");
  assert.equal(f.type, "or");
});

/* --------------------------- document builder --------------------------- */

const scriptDto: ScriptDetailDTO = {
  id: "s1", title: "Пробное посещение", slug: "probnoe", description: "desc",
  categoryId: "c1", categoryTitle: "Первичный контакт", updatedAt: "2026-01-01T00:00:00.000Z",
  content: {
    whenToUse: "Когда клиент пришёл на пробное",
    goal: "Записать на встречу",
    keyQuestions: ["Занимались раньше?"],
    script: [{ type: "paragraph", spans: [{ text: "Здравствуйте!" }] }],
    doNotSay: ["Это дорого"],
    nextStep: "Назначить встречу",
  },
};

test("script document is SALES-scoped, labelled, and carries retrieval attributes", () => {
  const doc = buildScriptDoc(scriptDto, "2026-01-01T00:00:00.000Z");
  assert.equal(doc.positionScope, "SALES");
  assert.equal(doc.sourceType, "SCRIPT");
  assert.match(doc.content, /Пробное посещение/);
  assert.match(doc.content, /СЦЕНАРИЙ РАЗГОВОРА/);
  assert.match(doc.content, /Здравствуйте!/);
  assert.equal(doc.attributes.positionScope, "SALES");
  assert.equal(doc.attributes.sourceType, "SCRIPT");
  assert.equal(doc.attributes.status, "PUBLISHED");
});

test("instruction + lesson documents are ALL-scoped and exclude non-text/quiz data", () => {
  const instr: InstructionDetailDTO = {
    id: "i1", title: "Входящее обращение", slug: "vhod", summary: "s",
    categoryId: "c", categoryTitle: "Работа", updatedAt: "2026-01-01T00:00:00.000Z",
    blocks: [
      { id: "b1", type: "STEPS", title: null, steps: [{ id: "x", text: "Открыть заявку" }] },
      { id: "b2", type: "WARNING", title: null, text: "Не давать цену без прайса" },
    ],
  };
  const idoc = buildInstructionDoc(instr, "2026-01-01T00:00:00.000Z");
  assert.equal(idoc.positionScope, "ALL");
  assert.match(idoc.content, /Открыть заявку/);
  assert.match(idoc.content, /ПРЕДУПРЕЖДЕНИЕ/);

  const blocks: LessonBlockDTO[] = [
    { id: "v", type: "VIDEO", order: 0, url: "https://secret", posterUrl: null, caption: "c" },
    { id: "t", type: "COLLAPSIBLE_TEXT", order: 1, title: "Абонемент", doc: [{ type: "paragraph", spans: [{ text: "Что входит" }] }], defaultExpanded: false },
    { id: "k", type: "KEY_TAKEAWAYS", order: 2, title: "Главное", items: [{ id: "i", title: "Доступ", text: "24/7", icon: null, variant: "DEFAULT" }] },
  ];
  const ldoc = buildLessonDoc({ id: "l1", title: "Преимущества", slug: "adv", shortDescription: null, blocks, updatedAt: "2026-01-01T00:00:00.000Z" });
  assert.equal(ldoc.positionScope, "ALL");
  assert.match(ldoc.content, /Что входит/);
  assert.match(ldoc.content, /Доступ — 24\/7/);
  assert.doesNotMatch(ldoc.content, /https:\/\/secret/); // media urls are never indexed
});

/* ---------------------------- response parsing -------------------------- */

test("E: response parser extracts text + maps file citations to source ids", () => {
  const payload = {
    id: "resp_1",
    output: [
      { type: "file_search_call" },
      {
        type: "message",
        content: [{
          type: "output_text",
          text: "В абонемент входит доступ 24/7.",
          annotations: [
            { type: "file_citation", file_id: "file_A" },
            { type: "file_citation", file_id: "file_A" },
            { type: "file_citation", file_id: "file_B" },
          ],
        }],
      },
    ],
    usage: { input_tokens: 100, output_tokens: 20 },
  };
  const r = parseResponsePayload(payload);
  assert.equal(r.text, "В абонемент входит доступ 24/7.");
  assert.equal(r.responseId, "resp_1");
  assert.deepEqual(r.citedFileIds.sort(), ["file_A", "file_B"]);
  assert.deepEqual(r.usage, { inputTokens: 100, outputTokens: 20 });
});

test("empty output yields empty text (caller rejects → safe error, no fake answer)", () => {
  assert.equal(parseResponsePayload({ id: "r", output: [] }).text, "");
});

/* ------------------------------ rate limit ------------------------------ */

test("L: rate limit allows a burst then blocks within the window", () => {
  _resetMetricRate();
  const now = 1_000_000;
  for (let i = 0; i < 10; i++) assert.equal(checkMetricRate("u1", now).allowed, true);
  const blocked = checkMetricRate("u1", now);
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSeconds > 0);
  // A different user is unaffected; the window slides.
  assert.equal(checkMetricRate("u2", now).allowed, true);
  assert.equal(checkMetricRate("u1", now + 61_000).allowed, true);
});

/* --------------------------- system instructions ------------------------ */

const INSTR = buildSystemInstructions({
  displayName: "Даниил", roleTitle: "Сотрудник", positionTitle: "Менеджер по работе с клиентами",
  cityName: "Екатеринбург", clubName: "Клуб 1", scriptsAllowed: true,
});

test("H: system instructions carry only safe context (no telegram id / tokens)", () => {
  assert.match(INSTR, /Метрик/);
  assert.match(INSTR, /Даниил/);
  assert.doesNotMatch(INSTR, /telegram/i);
  assert.doesNotMatch(INSTR, /token/i);
  assert.doesNotMatch(INSTR, /OPENAI/i);
});

test("system instructions add a script restriction for positions without access", () => {
  const restricted = buildSystemInstructions({
    displayName: "A", roleTitle: "Сотрудник", positionTitle: "Администратор клуба",
    cityName: null, clubName: null, scriptsAllowed: false,
  });
  assert.match(restricted, /недоступны продажные скрипты/);
});

/* ------------------- grounding policy (three levels) -------------------- */

test("grounding 1: corporate facts only from retrieved METRO UP materials", () => {
  assert.ok(INSTR.includes("ТОЛЬКО если оно прямо подтверждено найденными материалами METRO UP"));
  assert.ok(INSTR.includes("Такие факты бери только из найденной базы"));
});

test("grounding 2: no false attribution to a source", () => {
  assert.ok(INSTR.includes("Не создавай ложную атрибуцию источнику"));
  assert.ok(INSTR.includes("означает только то, что источник использовался"));
  assert.ok(INSTR.includes("Не приписывай такой вывод источнику"));
});

test("grounding 3: general AI abilities are explicitly allowed", () => {
  assert.ok(INSTR.includes("рассуждать, объяснять, сокращать, переформулировать"));
  assert.ok(INSTR.includes("помогай своими общими знаниями"));
});

test("grounding 4: missing corporate info is stated explicitly", () => {
  assert.ok(INSTR.includes("прямо скажи об этом"));
  assert.ok(INSTR.includes("В базе METRO UP пока нет утверждённого материала"));
});

test("grounding 5: general advice is not called a MetroFitness regulation", () => {
  assert.ok(INSTR.includes("это общий совет, а не регламент MetroFitness"));
});

test("grounding 6: prices/promos must not be invented", () => {
  assert.ok(INSTR.includes("Никогда не выдумывай цену, акцию, условие или процедуру"));
});

test("grounding 7: sensitive topics without a source are not turned into an invented procedure", () => {
  assert.ok(INSTR.includes("возвраты, договоры, касса"));
  assert.ok(INSTR.includes("НЕ давай конкретную процедуру как факт без подтверждающего источника METRO UP"));
  assert.ok(INSTR.includes("направь к ответственному"));
});

test("grounding 8: adapting an existing script is allowed, but new company terms are not invented", () => {
  assert.ok(INSTR.includes("адаптируй формулировку под ситуацию"));
  assert.ok(INSTR.includes("новые условия, цены или правила компании при этом не придумывай"));
});

/* ------------------ integration scenarios (require Postgres/OpenAI) ------ */

const skip = { skip: "integration: requires Postgres + mocked/real OpenAI transport" } as const;
test("A: only PUBLISHED sources are indexed (loaders filter status=PUBLISHED)", skip, () => {});
test("B: DRAFT sources are excluded from the index", skip, () => {});
test("C: ARCHIVED sources are removed from retrieval", skip, () => {});
test("F: corporate question with no reliable match → no invented fact", skip, () => {});
test("G: general rewrite request works without any knowledge match", skip, () => {});
test("I: a user sees only their own conversation", skip, () => {});
test("J: fetching another user's conversation is rejected (404)", skip, () => {});
test("K: feature flag off → no OpenAI request is made", skip, () => {});
test("M: OpenAI failure → safe error, no fake answer, retry available", skip, () => {});
test("N: sync is idempotent (re-sync replaces the source file)", skip, () => {});
test("O: updating a source re-syncs its current version", skip, () => {});
test("P: archiving a source removes it from retrieval", skip, () => {});
test("Q: OPENAI_API_KEY stays server-only (never in any DTO/log)", skip, () => {});
