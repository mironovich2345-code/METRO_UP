import { test } from "node:test";
import assert from "node:assert/strict";
import { scopeForSource, positionAllows, retrievalFilter, normalizeScope } from "../src/lib/server/metric/access";
import { buildScriptDoc, buildInstructionDoc, buildLessonDoc, buildDocumentDoc } from "../src/lib/server/metric/documents";
import { parseResponsePayload } from "../src/lib/server/metric/openai-parse";
import { extractDocumentText, detectFormat, docxXmlToText, sanitizeFilename, pdfContentToText, sanitizeExtractedText } from "../src/lib/server/metric/document-text";
import { resolveMaxOutputTokens, DEFAULT_MAX_OUTPUT_TOKENS, MAX_OUTPUT_CEILING } from "../src/lib/server/metric/token-policy";
import { isClickableSource } from "../src/lib/metric-source";
import { checkMetricRate, _resetMetricRate } from "../src/lib/server/metric/rate-limit";
import { buildSystemInstructions } from "../src/lib/server/metric/instructions";
import {
  classifyMode, needsRetrieval, nextRolePlayState,
  readRolePlayState, writeRolePlayState, rolePlayEqual,
} from "../src/lib/server/metric/mode";
import { parseSSEBlock, splitSSE } from "../src/lib/server/metric/stream-parse";
import { consumeSSEStream, SSEStreamError, type ByteReader } from "../src/lib/server/metric/stream-consume";
import { metricMarkdownToRichDoc } from "../src/lib/metric-markdown";
import { sliceHistory, SMOKE_SET, HISTORY_VARIANTS, RETRIEVAL_VARIANTS } from "../src/lib/server/metric/bench-config";
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

/* ---------------- PDF extraction: ReDoS / event-loop safety -------------- */
/*
 * Regression for the PDF-upload hang: a stream that is not clean FlateDecode was
 * fed as RAW BINARY to the text-operator regexes, whose TJ-array pattern had
 * overlapping alternatives → catastrophic (exponential) backtracking → CPU pegged
 * and the Node event loop blocked (/, /control hung; UI stuck on «Загружаем…»).
 * Extraction must now stay BOUNDED and fast on any input.
 */
function buildSimplePdf(text: string): Buffer {
  const stream = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`;
  return Buffer.from(
    `%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n` +
    `4 0 obj<</Length ${stream.length}>>\nstream\n${stream}\nendstream\nendobj\n%%EOF`,
    "latin1",
  );
}

test("PDF-A: a simple text PDF extracts its text quickly", () => {
  // ASCII fixture: a hand-built PDF stores operator strings byte-for-byte, and the
  // extractor reads latin1 — so use a latin1-safe string here (real PDFs carry
  // their own encoding). The point is correct + fast extraction.
  const t = performance.now();
  const res = extractDocumentText("application/pdf", "a.pdf", buildSimplePdf("Club rules: open 7 to 23"));
  const ms = performance.now() - t;
  assert.equal(res.ok, true);
  if (res.ok) assert.match(res.text, /Club rules/);
  assert.ok(ms < 500, `simple pdf should be fast, took ${ms.toFixed(0)}ms`);
});

test("PDF-B: TJ-array regex is not exponential — a long backslash run returns instantly", () => {
  // With the old overlapping-alternative regex this hung for minutes at n≈60.
  const evil = "[" + "\\".repeat(60) + "x"; // '[' + backslash run, no closing ']TJ'
  const t = performance.now();
  const out = pdfContentToText(evil);
  const ms = performance.now() - t;
  assert.equal(typeof out, "string");
  assert.ok(ms < 100, `must be linear; took ${ms.toFixed(0)}ms`);
});

test("PDF-C: a raw-binary stream (inflate-fail fallback) stays bounded and yields no_text", () => {
  // ~160K chars of '[', '\\', ']' — the shape that hung production.
  let junk = "";
  for (let i = 0; i < 40000; i++) junk += "[\\\\\\";
  const buf = Buffer.from(`%PDF-1.4\nstream\n${junk}\nendstream\n%%EOF`, "latin1");
  const t = performance.now();
  const res = extractDocumentText("application/pdf", "g.pdf", buf);
  const ms = performance.now() - t;
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.reason, "no_text");
  assert.ok(ms < 2000, `extraction must stay bounded; took ${ms.toFixed(0)}ms`);
});

test("PDF-D: a malformed PDF (stream without endstream) does not hang", () => {
  const buf = Buffer.from(`%PDF-1.4\nstream\n(text but never closed with endstream ${"x".repeat(50000)}`, "latin1");
  const t = performance.now();
  const res = extractDocumentText("application/pdf", "m.pdf", buf);
  const ms = performance.now() - t;
  assert.equal(res.ok, false); // no complete stream → no text
  assert.ok(ms < 2000, `malformed pdf must not hang; took ${ms.toFixed(0)}ms`);
});

/* -------- PostgreSQL-safe sanitization of extracted text (NUL byte) ------ */
/*
 * Regression for SQLSTATE 22021 ("invalid byte sequence for encoding UTF8:
 * 0x00"): PDFs that encode strings as 2-byte / Identity font codes (e.g. Google
 * Sheets exports) yield extracted text containing NUL bytes, which PostgreSQL TEXT
 * rejects. sanitizeExtractedText() is the single choke point every format passes
 * through before storage AND before RAG indexing.
 */
const NUL = String.fromCharCode(0);

test("SAN-A: NUL between words is removed", () => {
  const out = sanitizeExtractedText(`Привет${NUL} мир`);
  assert.equal(out, "Привет мир");
  assert.equal(out.includes(NUL), false);
});

test("SAN-B: Russian Unicode is preserved intact", () => {
  const s = "Абонемент — 24/7: зал, бассейн и групповые «занятия».";
  assert.equal(sanitizeExtractedText(s), s);
});

test("SAN-C: English / general Unicode is preserved intact", () => {
  const s = "Club rules: open 7–23 (24/7). Café ☕ €10 — ok.";
  assert.equal(sanitizeExtractedText(s), s);
});

test("SAN-D: newlines and tabs are not destroyed (only CRLF folded to LF)", () => {
  assert.equal(sanitizeExtractedText("a\tb\nc\r\nd"), "a\tb\nc\nd");
  assert.match(sanitizeExtractedText("line1\nline2"), /line1\nline2/);
});

test("SAN-E: text that is only NUL/control noise becomes empty (→ no_text upstream)", () => {
  const out = sanitizeExtractedText(NUL + String.fromCharCode(1) + String.fromCharCode(7) + String.fromCharCode(127));
  assert.equal(out, "");
});

test("SAN-F: PDF extraction containing NUL returns PostgreSQL-safe text", () => {
  // A Tj string with NUL bytes between letters (as 2-byte-encoded PDFs produce).
  const stream = `BT (H${NUL}e${NUL}l${NUL}l${NUL}o${NUL} ${NUL}M${NUL}i${NUL}r${NUL}) Tj ET`;
  const buf = Buffer.from(`%PDF-1.4\n4 0 obj<</Length ${stream.length}>>\nstream\n${stream}\nendstream\nendobj\n%%EOF`, "latin1");
  const res = extractDocumentText("application/pdf", "g.pdf", buf);
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.text.includes(NUL), false);
    assert.match(res.text, /Hello Mir/);
  }
});

test("SAN-G: TXT and MD go through the same sanitizer (NUL stripped, text kept)", () => {
  const txt = extractDocumentText("text/plain", "a.txt", Buffer.from(`Правила${NUL} клуба`, "utf8"));
  assert.equal(txt.ok, true);
  if (txt.ok) { assert.equal(txt.text.includes(NUL), false); assert.match(txt.text, /Правила клуба/); }
  const md = extractDocumentText("text/markdown", "a.md", Buffer.from(`# Заголовок${NUL}\nтекст`, "utf8"));
  assert.equal(md.ok, true);
  if (md.ok) assert.equal(md.text.includes(NUL), false);
});

test("SAN-H: a document that is only NUL after extraction is rejected as no_text", () => {
  const res = extractDocumentText("text/plain", "z.txt", Buffer.from(NUL + NUL + NUL, "utf8"));
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.reason, "no_text");
});

test("SAN-invariant: sanitized output never contains a NUL byte (varied inputs)", () => {
  for (const s of ["", NUL, `a${NUL}b`, "чистый текст", "x".repeat(1000) + NUL, `${NUL}\n\t ${NUL}end`]) {
    assert.equal(sanitizeExtractedText(s).includes(NUL), false, `input ${JSON.stringify(s)}`);
  }
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

/* =======================================================================
 * Metric Interaction v2 — mode routing, retrieval policy, prompt policy,
 * SSE stream parsing, safe markdown. All pure (no OpenAI/DB/HTTP).
 * ===================================================================== */

/* --------------------------- A. mode routing ---------------------------- */

test("v2-A: informational questions route to ANSWER (no retrieval skip)", () => {
  for (const q of ["Что входит в клубную карту?", "Расскажи про пробное посещение", "Какие зоны есть в клубе?"]) {
    const d = classifyMode(q, null);
    assert.equal(d.mode, "ANSWER", q);
    assert.equal(needsRetrieval(d.mode, d.transform), true, q);
  }
});

test("v2-A: 'что ответить клиенту' situations route to ASSIST", () => {
  for (const q of ["Что ответить клиенту, который говорит что дорого?", "Как лучше сказать клиенту про продление?", "Клиент сомневается, что делать?"]) {
    const d = classifyMode(q, null);
    assert.equal(d.mode, "ASSIST", q);
    assert.equal(needsRetrieval(d.mode, d.transform), true, q); // ASSIST always retrieves
  }
});

test("v2-A: 'давай потренируемся' starts role-play (ROLE_PLAY_START)", () => {
  for (const q of ["Давай потренируемся", "Давай отработаем возражение дорого", "Ты клиент, я менеджер"]) {
    const d = classifyMode(q, null);
    assert.equal(d.mode, "ROLE_PLAY_START", q);
    assert.equal(needsRetrieval(d.mode, d.transform), true, q); // start still grounds the scenario
  }
});

test("v2-A: while role-play is active a normal message is a client turn (ROLE_PLAY, no retrieval)", () => {
  const rp = { active: true, scenario: null };
  const d = classifyMode("Мне это дорого, честно говоря", rp);
  assert.equal(d.mode, "ROLE_PLAY");
  assert.equal(needsRetrieval(d.mode, d.transform), false); // client reply — no corporate facts
});

test("v2-A: exit triggers during role-play route to REVIEW (with retrieval for grounded criteria)", () => {
  const rp = { active: true, scenario: null };
  for (const q of ["стоп", "разбери как я справился", "дай обратную связь"]) {
    const d = classifyMode(q, rp);
    assert.equal(d.mode, "REVIEW", q);
    assert.equal(needsRetrieval(d.mode, d.transform), true, q);
  }
});

test("v2-A: start/exit are gated by state — 'стоп' with no active role-play is just ANSWER", () => {
  assert.equal(classifyMode("стоп", null).mode, "ANSWER");
  // A role-play trigger does NOT fire mid-role-play (already active → stays a client turn).
  assert.equal(classifyMode("давай ещё раз", { active: true, scenario: null }).mode, "ROLE_PLAY");
});

test("v2-A: 'подробно' sets detailed; ANSWER stays ANSWER", () => {
  const d = classifyMode("Объясни подробнее про абонемент", null);
  assert.equal(d.mode, "ANSWER");
  assert.equal(d.detailed, true);
});

/* ------------------------ B. retrieval policy --------------------------- */

test("v2-B: pure transforms skip retrieval; corporate requests never do", () => {
  const shorten = classifyMode("Сократи этот текст", null);
  assert.equal(shorten.transform, true);
  assert.equal(needsRetrieval(shorten.mode, shorten.transform), false); // pure rewrite
  // But a transform-looking word inside a client-facing ask still retrieves via ASSIST.
  const assist = classifyMode("Как ответить клиенту, который просит скидку?", null);
  assert.equal(needsRetrieval(assist.mode, assist.transform), true);
});

test("v2-B: retrieval matrix — only ROLE_PLAY turn and ANSWER+transform skip", () => {
  assert.equal(needsRetrieval("ANSWER", false), true);
  assert.equal(needsRetrieval("ANSWER", true), false);
  assert.equal(needsRetrieval("ASSIST", true), true); // ASSIST retrieves even if a transform word appears
  assert.equal(needsRetrieval("ROLE_PLAY_START", false), true);
  assert.equal(needsRetrieval("ROLE_PLAY", false), false);
  assert.equal(needsRetrieval("REVIEW", false), true);
});

/* ----------------------- role-play state machine ------------------------ */

test("v2: role-play state transitions and (de)serialisation are stable", () => {
  assert.deepEqual(nextRolePlayState("ROLE_PLAY_START", null), { active: true, scenario: null });
  assert.deepEqual(nextRolePlayState("REVIEW", { active: true, scenario: null }), { active: false });
  assert.deepEqual(nextRolePlayState("ROLE_PLAY", { active: true, scenario: "x" }), { active: true, scenario: "x" });

  const stored = writeRolePlayState({ other: 1 }, { active: true, scenario: "дорого" });
  assert.equal((stored as { other: number }).other, 1); // unrelated state preserved
  assert.deepEqual(readRolePlayState(stored), { active: true, scenario: "дорого" });

  const cleared = writeRolePlayState(stored, { active: false });
  assert.equal(readRolePlayState(cleared), null); // inactive → no rolePlay key
  assert.equal(readRolePlayState(null), null);
  assert.equal(readRolePlayState({}), null);

  assert.equal(rolePlayEqual(null, { active: false }), true);
  assert.equal(rolePlayEqual({ active: true, scenario: null }, { active: true, scenario: null }), true);
  assert.equal(rolePlayEqual({ active: true, scenario: "a" }, { active: true, scenario: "b" }), false);
});

/* --------------------- C. prompt policy (per mode) ---------------------- */

const CTX = {
  displayName: "Даниил", roleTitle: "Сотрудник", positionTitle: "Менеджер по работе с клиентами",
  cityName: "Екатеринбург", clubName: "Клуб 1", scriptsAllowed: true,
} as const;

test("v2-C: system prompt bans unsolicited artifacts (checklist/памятка/плакат/PDF)", () => {
  const p = buildSystemInstructions(CTX, "ANSWER");
  assert.ok(p.includes("чек-лист"));
  assert.ok(p.includes("памятк"));
  assert.ok(p.includes("плакат"));
  assert.ok(p.includes("распечат"));
  assert.ok(p.includes("PDF"));
  assert.ok(p.includes("Если хочешь, могу ещё")); // the banned dangling follow-up is named
});

test("v2-C: ASSIST prompt is action-first", () => {
  const p = buildSystemInstructions(CTX, "ASSIST");
  assert.ok(p.includes("ACTION FIRST"));
  assert.ok(/сначала дай конкретную реплику/i.test(p));
});

test("v2-C: ROLE_PLAY_START tells the model to enter the client role immediately", () => {
  const p = buildSystemInstructions(CTX, "ROLE_PLAY_START");
  assert.ok(/СРАЗУ войди в роль клиента/i.test(p));
  assert.ok(/Не объясняй тренировку/i.test(p));
});

test("v2-C: ROLE_PLAY prompt makes the model reply ONLY as the client", () => {
  const p = buildSystemInstructions(CTX, "ROLE_PLAY");
  assert.ok(/играешь КЛИЕНТА/i.test(p));
  assert.ok(/Отвечай ТОЛЬКО как клиент/i.test(p));
  assert.ok(/не приводи корпоративные факты/i.test(p));
});

test("v2-C: REVIEW prompt uses the structured debrief format", () => {
  const p = buildSystemInstructions(CTX, "REVIEW");
  assert.ok(p.includes("Что получилось"));
  assert.ok(p.includes("Что улучшить"));
  assert.ok(p.includes("Следующий фокус"));
});

test("v2-C: ANSWER default is concise, detailed only on request", () => {
  const concise = buildSystemInstructions(CTX, "ANSWER", false);
  assert.ok(/По умолчанию кратко/i.test(concise));
  const detailed = buildSystemInstructions(CTX, "ANSWER", true);
  assert.ok(/Пользователь просит подробно/i.test(detailed));
});

/* ------------------------ D. SSE stream parsing ------------------------- */

test("v2-D: parseSSEBlock extracts incremental text deltas", () => {
  const block = `event: response.output_text.delta\ndata: ${JSON.stringify({ type: "response.output_text.delta", delta: "Привет" })}`;
  assert.deepEqual(parseSSEBlock(block), { kind: "delta", text: "Привет" });
});

test("v2-D: parseSSEBlock yields the final response on completed/incomplete", () => {
  const completed = parseSSEBlock(`data: ${JSON.stringify({ type: "response.completed", response: { id: "r1", status: "completed" } })}`);
  assert.equal(completed?.kind, "final");
  if (completed?.kind === "final") assert.deepEqual(completed.response, { id: "r1", status: "completed" });
  const incomplete = parseSSEBlock(`data: ${JSON.stringify({ type: "response.incomplete", response: { id: "r2" } })}`);
  assert.equal(incomplete?.kind, "final");
});

test("v2-D: parseSSEBlock flags errors and ignores noise / [DONE] / keep-alives", () => {
  assert.deepEqual(parseSSEBlock(`data: ${JSON.stringify({ type: "response.failed" })}`), { kind: "error" });
  assert.deepEqual(parseSSEBlock(`data: ${JSON.stringify({ type: "error" })}`), { kind: "error" });
  assert.equal(parseSSEBlock("data: [DONE]"), null);
  assert.equal(parseSSEBlock(": keep-alive comment"), null); // no data line
  assert.equal(parseSSEBlock("data: not-json"), null);
  assert.equal(parseSSEBlock(`data: ${JSON.stringify({ type: "response.created" })}`), null); // unrelated event
});

test("v2-D: splitSSE returns complete blocks and keeps the partial remainder buffered", () => {
  const { blocks, rest } = splitSSE("data: a\n\ndata: b\n\ndata: par");
  assert.deepEqual(blocks, ["data: a", "data: b"]);
  assert.equal(rest, "data: par"); // partial block not yet emitted (no double newline)
});

/* ------------- D2. stream consumer lifecycle (CPU incident) ------------- */
/*
 * Regression for the v2 production incident: the SSE read loop kept reading a
 * stream the upstream left open after `response.completed`, which spun the CPU
 * to ~100% and starved the Node event loop (ordinary routes → 499). The consumer
 * must (1) stop reading the instant the final event arrives and (2) always cancel
 * the reader. A fake reader models each upstream behaviour.
 */
const _enc = new TextEncoder();
const _DELTA = (t: string) => `event: response.output_text.delta\ndata: ${JSON.stringify({ type: "response.output_text.delta", delta: t })}\n\n`;
const _FINAL = `event: response.completed\ndata: ${JSON.stringify({ type: "response.completed", response: { id: "r9", status: "completed" } })}\n\n`;

function fakeReader(scripted: string[], afterEnd?: () => { done: boolean; value?: Uint8Array }) {
  const state = { cancelled: false, reads: 0 };
  let i = 0;
  const reader: ByteReader = {
    async read() {
      state.reads++;
      if (state.reads > 100_000) throw new Error("SPUN: reader kept being read past the final event");
      if (i < scripted.length) return { done: false, value: _enc.encode(scripted[i++]) };
      if (afterEnd) return afterEnd();
      return { done: true };
    },
    async cancel() { state.cancelled = true; },
  };
  return { reader, state };
}

test("D2: consumer returns the final response, emits every delta, and cancels the reader", async () => {
  const { reader, state } = fakeReader([_DELTA("При"), _DELTA("вет"), _FINAL, "DONE-IGNORED"]);
  const deltas: string[] = [];
  const final = await consumeSSEStream(reader, (t) => deltas.push(t));
  assert.deepEqual(deltas, ["При", "вет"]);
  assert.deepEqual(final, { id: "r9", status: "completed" });
  assert.equal(state.cancelled, true); // socket released
});

test("D2: consumer STOPS reading after the final event — never spins on a non-closing upstream", async () => {
  // This reader would hand out keep-alive frames forever after the final event.
  // A correct consumer breaks right after `_FINAL` and never pulls the flood.
  const { reader, state } = fakeReader([_DELTA("hi"), _FINAL], () => ({ done: false, value: _enc.encode(": keep-alive\n\n") }));
  const final = await consumeSSEStream(reader, () => {});
  assert.deepEqual(final, { id: "r9", status: "completed" });
  assert.ok(state.reads <= 3, `must stop right after final; got ${state.reads} reads`);
  assert.equal(state.cancelled, true);
});

test("D2: an upstream error event throws SSEStreamError and still cancels the reader", async () => {
  const errEvt = `data: ${JSON.stringify({ type: "response.failed" })}\n\n`;
  const { reader, state } = fakeReader([_DELTA("x"), errEvt], () => ({ done: false, value: _enc.encode(": ping\n\n") }));
  await assert.rejects(consumeSSEStream(reader, () => {}), (e) => e instanceof SSEStreamError);
  assert.equal(state.cancelled, true);
});

test("D2: a stream that closes without a final event returns null (caller rejects → safe error)", async () => {
  const { reader, state } = fakeReader([_DELTA("partial")]); // then done, no final
  const final = await consumeSSEStream(reader, () => {});
  assert.equal(final, null);
  assert.equal(state.cancelled, true);
});

/* --------------------------- E. safe markdown --------------------------- */

test("v2-E: markdown → RichDoc handles bold, italics, bullets and numbered lists", () => {
  const doc = metricMarkdownToRichDoc("Вот **важное** и *курсив*.\n\n- первый\n- второй\n\n1. шаг один\n2. шаг два");
  const para = doc.find((n) => n.type === "paragraph");
  assert.ok(para && para.type === "paragraph");
  if (para && para.type === "paragraph") {
    assert.ok(para.spans.some((s) => s.bold && s.text === "важное"));
    assert.ok(para.spans.some((s) => s.italic && s.text === "курсив"));
  }
  const bullets = doc.find((n) => n.type === "bulletList");
  assert.ok(bullets && bullets.type === "bulletList" && bullets.items.length === 2);
  const numbers = doc.find((n) => n.type === "numberedList");
  assert.ok(numbers && numbers.type === "numberedList" && numbers.items.length === 2);
});

test("v2-E: markdown is XSS-safe — HTML is never structural, only inert text", () => {
  const doc = metricMarkdownToRichDoc("Опасно: <script>alert(1)</script> и <img src=x onerror=y>");
  // Every node is a known structural type; raw HTML survives only as literal text spans.
  for (const node of doc) {
    assert.ok(["paragraph", "heading", "quote", "bulletList", "numberedList"].includes(node.type));
  }
  const flat = JSON.stringify(doc);
  assert.ok(flat.includes("<script>")); // preserved as text, never interpreted (RichText renders text nodes only)
});

/* --------------- perf: benchmark helpers (offline, no secrets) ---------- */

test("perf: sliceHistory keeps the last N messages (same tail as production)", () => {
  const msgs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  assert.deepEqual(sliceHistory(msgs, 4), [9, 10, 11, 12]);
  assert.deepEqual(sliceHistory(msgs, 2), [11, 12]);
  assert.deepEqual(sliceHistory([1, 2], 6), [1, 2]); // fewer than keep → unchanged
  assert.deepEqual(sliceHistory(msgs, 0), []);
  // never mutates the input
  const copy = [1, 2, 3];
  sliceHistory(copy, 1);
  assert.deepEqual(copy, [1, 2, 3]);
});

test("perf: benchmark matrix matches the sprint (history 12/6/4/2, retrieval 6/4/3) and smoke set covers modes", () => {
  assert.deepEqual([...HISTORY_VARIANTS], [12, 6, 4, 2]);
  assert.deepEqual([...RETRIEVAL_VARIANTS], [6, 4, 3]);
  const modes = new Set(SMOKE_SET.map((s) => s.expectMode));
  for (const m of ["ANSWER", "ASSIST", "ROLE_PLAY"]) assert.ok(modes.has(m as never), `smoke set must cover ${m}`);
  assert.ok(SMOKE_SET.some((s) => s.followUp), "smoke set must include a context-dependent follow-up");
  assert.equal(SMOKE_SET.length, 6);
});

test("v2-E: headings are supported and empty input yields a single empty paragraph", () => {
  const h = metricMarkdownToRichDoc("## Заголовок");
  assert.equal(h[0].type, "heading");
  const empty = metricMarkdownToRichDoc("");
  assert.equal(empty.length, 1);
  assert.equal(empty[0].type, "paragraph");
});
