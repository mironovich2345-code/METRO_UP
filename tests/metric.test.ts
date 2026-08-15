import { test } from "node:test";
import assert from "node:assert/strict";
import { scopeForSource, positionAllows, retrievalFilter, normalizeScope } from "../src/lib/server/metric/access";
import { buildScriptDoc, buildInstructionDoc, buildLessonDoc, buildDocumentDoc } from "../src/lib/server/metric/documents";
import { parseResponsePayload } from "../src/lib/server/metric/openai-parse";
import { extractDocumentText, detectFormat, docxXmlToText, sanitizeFilename } from "../src/lib/server/metric/document-text";
import { resolveMaxOutputTokens, DEFAULT_MAX_OUTPUT_TOKENS, MAX_OUTPUT_CEILING } from "../src/lib/server/metric/token-policy";
import { isClickableSource } from "../src/lib/metric-source";
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
  assert.ok(INSTR.includes("подтверждает только те факты, которые реально содержатся в источнике"));
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

/* ----------- derived advice: model-built algorithm ≠ corporate ----------- */

test("derived: a self-built algorithm/script/methodology is not passed off as a corporate standard", () => {
  // Applies when sources confirm only facts, not the whole requested method.
  assert.ok(INSTR.includes("НЕ подтверждают запрошенный алгоритм, процедуру, скрипт или методику целиком"));
  // 1) mark the boundary of the base
  assert.ok(INSTR.includes("отдельного утверждённого скрипта или методики для этой ситуации в базе пока нет"));
  // 2) Metric may still offer its own working variant
  assert.ok(INSTR.includes("Могу предложить рабочий вариант на основе доступной информации"));
  // 3) treat it as Metric's recommendation, not a corporate standard
  assert.ok(INSTR.includes("считай такой алгоритм своей рекомендацией, а не корпоративным стандартом"));
  assert.ok(INSTR.includes("CORPORATE FACT ≠ MODEL-DERIVED RECOMMENDATION"));
});

test("derived: high-confidence corporate framings are banned for self-built solutions", () => {
  for (const banned of [
    "проверенная схема",
    "утверждённая схема",
    "по стандартам MetroFitness",
    "MetroFitness рекомендует",
    "учебный материал рекомендует",
    "правильный алгоритм",
    "готовый рабочий алгоритм",
  ]) {
    assert.ok(INSTR.includes(banned), `policy must name banned framing: ${banned}`);
  }
});

test("derived: Metric still reasons and builds solutions from corporate facts", () => {
  assert.ok(INSTR.includes("собирать решение из нескольких корпоративных фактов"));
  assert.ok(INSTR.includes("но честно обозначай происхождение такого решения"));
});

test("source-card confirms only facts actually in the source, not the whole answer", () => {
  assert.ok(INSTR.includes("подтверждает только те факты, которые реально содержатся в источнике, а не весь твой сгенерированный ответ"));
});

/*
 * Production case + analogous method requests. The retrieved knowledge holds
 * product facts (e.g. "Что получает клиент", "Групповые занятия") but NOT an
 * approved selling method. For any of these the policy above requires marking
 * that no approved method exists, then allowing Metric's own working variant —
 * without a corporate-standard framing:
 *   - "Как продать клиенту, который только пришёл в зал"
 *   - "Как продать клиенту абонемент?"
 *   - "Как обработать возражение «дорого»?"
 *   - "Как провести экскурсию по клубу?"
 * These are behavioural expectations verified live (see manual checklist); the
 * static policy assertions above are what the model is instructed to follow.
 */

/* ---------------------------- documents (V1) ---------------------------- */

test("document text extraction: txt/md decode; empty & unsupported are rejected", () => {
  const txt = extractDocumentText("text/plain", "a.txt", Buffer.from("Правила клуба\nПункт 1"));
  assert.equal(txt.ok, true);
  if (txt.ok) assert.match(txt.text, /Правила клуба/);
  assert.deepEqual(extractDocumentText("text/markdown", "a.md", Buffer.from("# Заголовок\nтекст")).ok, true);
  assert.deepEqual(extractDocumentText("text/plain", "a.txt", Buffer.from("")), { ok: false, reason: "empty" });
  assert.deepEqual(extractDocumentText("image/png", "a.png", Buffer.from("x")), { ok: false, reason: "unsupported" });
});

test("M: a file with no extractable text is rejected (no silent empty index)", () => {
  // A "pdf" with only whitespace / no text operators → no_text.
  const res = extractDocumentText("application/pdf", "scan.pdf", Buffer.from("%PDF-1.4\n   \n"));
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.reason, "no_text");
});

test("detectFormat + sanitizeFilename", () => {
  assert.equal(detectFormat("application/pdf", "x"), "pdf");
  assert.equal(detectFormat("application/vnd.openxmlformats-officedocument.wordprocessingml.document", "x"), "docx");
  assert.equal(detectFormat("application/octet-stream", "notes.MD"), "md");
  assert.equal(detectFormat("application/octet-stream", "a.exe"), null);
  assert.equal(sanitizeFilename("../../etc/passwd"), "passwd");
  assert.match(sanitizeFilename("Правила клуба.pdf"), /Правила клуба\.pdf/);
});

test("docxXmlToText turns WordprocessingML into readable text", () => {
  const xml = "<w:p><w:r><w:t>Строка 1</w:t></w:r></w:p><w:p><w:r><w:t>Строка 2</w:t></w:r></w:p>";
  const text = docxXmlToText(xml);
  assert.match(text, /Строка 1/);
  assert.match(text, /Строка 2/);
  assert.doesNotMatch(text, /<w:/);
});

test("B/E: document doc carries its own scope + only safe attributes (no PII/secrets)", () => {
  const doc = buildDocumentDoc({
    id: "d1", title: "Правила клуба", description: "внутренние правила", category: "CLUB_RULES",
    extractedText: "Клуб работает с 7:00 до 23:00.", positionScope: normalizeScope("SALES"),
    versionLabel: "ред. 2026-01", updatedAt: "2026-01-01T00:00:00.000Z",
  });
  assert.equal(doc.sourceType, "DOCUMENT");
  assert.equal(doc.positionScope, "SALES");
  assert.match(doc.content, /Клуб работает с 7:00/);
  const keys = Object.keys(doc.attributes).sort();
  assert.deepEqual(keys, ["positionScope", "slug", "sourceId", "sourceType", "status", "title", "updatedAt"]);
  const blob = JSON.stringify(doc.attributes).toLowerCase();
  for (const bad of ["apikey", "openai", "telegram", "secret", "token"]) assert.equal(blob.includes(bad), false);
});

test("document access: SALES-scoped document hidden from non-sales positions", () => {
  assert.equal(positionAllows("ADMINISTRATOR", "SALES"), false);
  assert.equal(positionAllows("CLIENT_MANAGER", "SALES"), true);
  assert.deepEqual(retrievalFilter("ADMINISTRATOR"), { type: "eq", key: "positionScope", value: "ALL" });
});

/* --------------------------- output-token policy ------------------------ */

test("A: default max output tokens is 2500", () => {
  assert.equal(DEFAULT_MAX_OUTPUT_TOKENS, 2500);
  assert.equal(resolveMaxOutputTokens(undefined), 2500);
  assert.equal(resolveMaxOutputTokens(""), 2500);
  assert.equal(resolveMaxOutputTokens("0"), 2500);
});

test("B: env override is honoured and clamped to the ceiling", () => {
  assert.equal(resolveMaxOutputTokens("2000"), 2000);
  assert.equal(resolveMaxOutputTokens("3000"), 3000);
  assert.equal(resolveMaxOutputTokens("99999"), MAX_OUTPUT_CEILING);
  assert.ok(MAX_OUTPUT_CEILING >= 2500);
});

/* -------------------- document source presentation ---------------------- */

test("Q/R: DOCUMENT source is attribution-only; others stay clickable", () => {
  assert.equal(isClickableSource("DOCUMENT"), false);
  assert.equal(isClickableSource("ACADEMY"), true);
  assert.equal(isClickableSource("SCRIPT"), true);
  assert.equal(isClickableSource("INSTRUCTION"), true);
});

/* -------------------------- complete responses -------------------------- */

test("O: a completed response is not marked truncated", () => {
  const r = parseResponsePayload({ id: "r", status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: "Готово." }] }] });
  assert.equal(r.truncated, false);
  assert.equal(r.text, "Готово.");
});

test("P: an incomplete max_output_tokens response is marked truncated", () => {
  const r = parseResponsePayload({
    id: "r", status: "incomplete", incomplete_details: { reason: "max_output_tokens" },
    output: [{ type: "message", content: [{ type: "output_text", text: "Цель: понять фокус — кар" }] }],
  });
  assert.equal(r.truncated, true);
  assert.match(r.text, /Цель: понять/);
});

test("V: incomplete for a non-token reason is not treated as truncated", () => {
  const r = parseResponsePayload({ id: "r", status: "incomplete", incomplete_details: { reason: "content_filter" }, output_text: "..." });
  assert.equal(r.truncated, false);
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
// Documents
test("docA: DRAFT document not indexed (loader filters PUBLISHED)", skip, () => {});
test("docC: ARCHIVED document removed from retrieval", skip, () => {});
test("docD: employee sees only PUBLISHED documents", skip, () => {});
test("docF: original file metadata retained (storageKey/mime/size)", skip, () => {});
test("docG: replacing a file re-syncs without duplicating the vector-store file", skip, () => {});
test("docH: fullSync includes DOCUMENT sources", skip, () => {});
test("docI: source card opens the employee /knowledge/documents/[id] route", skip, () => {});
test("docJ: only ADMIN can create/edit/publish documents", skip, () => {});
test("docK: an employee cannot upload a document", skip, () => {});
test("docL: OpenAI sync failure leaves the document PUBLISHED with FAILED/PENDING sync", skip, () => {});
// Complete responses
test("R: continuation targets the same conversation/user", skip, () => {});
test("S: continuation cannot target another user's message (404)", skip, () => {});
test("T: continuation appends without duplicating prior content", skip, () => {});
test("U: timeout/error does not persist a broken partial as a successful complete answer", skip, () => {});
test("W: DB stores a long response without clipping", skip, () => {});
// Continuation (fixed): deterministic last-message + preserved grounding/access
test("contE: continuation only on the caller's own conversation", skip, () => {});
test("contF: another user's conversation/message is denied", skip, () => {});
test("contG: continuation resends history + question + partial answer as context", skip, () => {});
test("contH: continuation keeps file_search + position filter (grounding/access)", skip, () => {});
test("contI: a completed continuation clears isTruncated (button disappears)", skip, () => {});
test("contJ: a still-incomplete continuation keeps the button", skip, () => {});
test("contK: continuation appends without duplicating the prior text", skip, () => {});
test("contL: continuation failure leaves the original message intact", skip, () => {});
test("contN: server logs a safe continuation diagnostic (no secret/PII)", skip, () => {});
// Documents visibility
test("S: employees have no raw document viewer route", skip, () => {});
test("T: ADMIN document management is unaffected", skip, () => {});
