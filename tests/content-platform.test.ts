import { test } from "node:test";
import assert from "node:assert/strict";
import { validateUpload, randomStorageKey, mediaKindForMime } from "../src/lib/storage/validation";
import { gradeQuiz, validateQuizStructure, toPublicQuizDTO, isPerfect } from "../src/lib/server/quiz";
import { accessAt, type SequenceLesson } from "../src/lib/server/gating-core";
import { plainToRichDoc, richDocToPlain } from "../src/lib/rich-text";
import { parseBlockData, safeParseBlockData } from "../src/lib/server/content-schemas";

/**
 * Content platform — A–V matrix (section 36). Pure logic is unit-tested here;
 * DB-bound scenarios are explicit integration skips (require Postgres + client),
 * mirroring tests/foundation.test.ts.
 */

/* ----------------------- G / H — upload file rules ----------------------- */

test("G: wrong MIME rejected", () => {
  assert.equal(validateUpload("VIDEO", "video/avi", 1000).ok, false);
  assert.equal(validateUpload("IMAGE", "image/gif", 1000).ok, false);
  assert.equal(mediaKindForMime("video/mp4"), "VIDEO");
  assert.equal(mediaKindForMime("application/zip"), null);
});

test("H: oversized video rejected; valid sizes pass", () => {
  const tooBig = validateUpload("VIDEO", "video/mp4", 600 * 1024 * 1024);
  assert.equal(tooBig.ok, false);
  if (!tooBig.ok) assert.equal(tooBig.code, "FILE_TOO_LARGE");
  assert.equal(validateUpload("VIDEO", "video/mp4", 100 * 1024 * 1024).ok, true);
  assert.equal(validateUpload("IMAGE", "image/png", 11 * 1024 * 1024).ok, false);
  assert.equal(validateUpload("IMAGE", "image/png", 2 * 1024 * 1024).ok, true);
});

test("storage key is random, extension from MIME, no user filename", () => {
  const a = randomStorageKey("VIDEO", "video/mp4");
  const b = randomStorageKey("VIDEO", "video/mp4");
  assert.match(a, /^videos\/[0-9a-f-]+\.mp4$/);
  assert.notEqual(a, b); // random
  assert.equal(randomStorageKey("IMAGE", "image/webp").startsWith("images/"), true);
  assert.match(randomStorageKey("IMAGE", "image/webp"), /\.webp$/);
});

/* --------------------------- K — quiz DTO safety ------------------------- */

test("K: public quiz DTO never leaks isCorrect / explanation", () => {
  const dto = toPublicQuizDTO(
    {
      id: "q1", title: "T", description: null, passingPercent: 70, maxAttempts: null, xpReward: 10,
      questions: [
        { id: "qq1", text: "Q", type: "SINGLE_CHOICE", order: 1, options: [
          { id: "o1", text: "A", order: 1 }, { id: "o2", text: "B", order: 2 },
        ] },
      ],
    },
    0,
  );
  const serialized = JSON.stringify(dto);
  assert.equal(serialized.includes("isCorrect"), false);
  assert.equal(serialized.includes("explanation"), false);
  assert.equal(dto.questions[0].options.length, 2);
});

/* ----------------------------- L — quiz rules --------------------------- */

test("L: invalid quiz rejected (single/multiple/true-false rules)", () => {
  const base = { title: "t", description: null, passingPercent: 70, maxAttempts: null, xpReward: 0 };
  const singleTwoCorrect = validateQuizStructure({
    ...base,
    questions: [{ text: "q", type: "SINGLE_CHOICE", explanation: null, options: [
      { text: "a", isCorrect: true }, { text: "b", isCorrect: true },
    ] }],
  });
  assert.ok(singleTwoCorrect.some((e) => e.code === "SINGLE_NEEDS_ONE"));

  const multiZero = validateQuizStructure({
    ...base,
    questions: [{ text: "q", type: "MULTIPLE_CHOICE", explanation: null, options: [
      { text: "a", isCorrect: false }, { text: "b", isCorrect: false },
    ] }],
  });
  assert.ok(multiZero.some((e) => e.code === "MULTI_NEEDS_ONE"));

  const tfThree = validateQuizStructure({
    ...base,
    questions: [{ text: "q", type: "TRUE_FALSE", explanation: null, options: [
      { text: "a", isCorrect: true }, { text: "b", isCorrect: false }, { text: "c", isCorrect: false },
    ] }],
  });
  assert.ok(tfThree.some((e) => e.code === "TF_NEEDS_TWO"));

  const valid = validateQuizStructure({
    ...base,
    questions: [{ text: "q", type: "SINGLE_CHOICE", explanation: null, options: [
      { text: "a", isCorrect: true }, { text: "b", isCorrect: false },
    ] }],
  });
  assert.deepEqual(valid, []);
});

/* -------------------------- O / P — quiz grading ------------------------ */

const gradable = {
  passingPercent: 70,
  questions: [
    { id: "q1", type: "SINGLE_CHOICE" as const, explanation: "e1", options: [
      { id: "a", isCorrect: true }, { id: "b", isCorrect: false } ] },
    { id: "q2", type: "MULTIPLE_CHOICE" as const, explanation: null, options: [
      { id: "c", isCorrect: true }, { id: "d", isCorrect: true }, { id: "e", isCorrect: false } ] },
  ],
};

test("P: quiz pass — all correct → 100%, passed", () => {
  const r = gradeQuiz(gradable, { answers: [
    { questionId: "q1", optionIds: ["a"] },
    { questionId: "q2", optionIds: ["c", "d"] },
  ] });
  assert.equal(r.scorePercent, 100);
  assert.equal(r.passed, true);
  assert.equal(isPerfect(r), true);
});

test("O: quiz fail — wrong answers → not passed, no completion", () => {
  const r = gradeQuiz(gradable, { answers: [
    { questionId: "q1", optionIds: ["b"] },
    { questionId: "q2", optionIds: ["c"] }, // partial → wrong (needs c+d)
  ] });
  assert.equal(r.passed, false);
  assert.ok(r.scorePercent < 70);
});

test("grading ignores option ids that don't belong to the question", () => {
  const r = gradeQuiz(gradable, { answers: [
    { questionId: "q1", optionIds: ["a", "zzz"] }, // foreign id ignored
    { questionId: "q2", optionIds: ["c", "d"] },
  ] });
  assert.equal(r.scorePercent, 100);
});

/* -------------------- M / N / S / T — gating (access) ------------------- */

const seq: SequenceLesson[] = [
  { id: "l1", slug: "l1", title: "L1", isRequired: true, dayNumber: 1, courseOrder: 1, lessonOrder: 1 },
  { id: "l2", slug: "l2", title: "L2", isRequired: true, dayNumber: 1, courseOrder: 1, lessonOrder: 2 },
  { id: "l3", slug: "l3", title: "L3", isRequired: true, dayNumber: 2, courseOrder: 1, lessonOrder: 1 },
];

test("M: first lesson is accessible", () => {
  assert.equal(accessAt(seq, 0, new Set()).locked, false);
});
test("N: locked lesson denied while prior required incomplete", () => {
  assert.equal(accessAt(seq, 1, new Set()).locked, true);
});
test("S: next lesson unlocks after prior completed", () => {
  assert.equal(accessAt(seq, 1, new Set(["l1"])).locked, false);
});
test("T: next day stays locked until prior day complete", () => {
  assert.equal(accessAt(seq, 2, new Set(["l1"])).locked, true); // l2 (day1) not done
  assert.equal(accessAt(seq, 2, new Set(["l1", "l2"])).locked, false);
});
test("gating: non-required prior lesson does not block", () => {
  const s2: SequenceLesson[] = [
    { ...seq[0], isRequired: false },
    seq[1],
  ];
  assert.equal(accessAt(s2, 1, new Set()).locked, false);
});

/* ----------------------- block data + rich text ------------------------ */

test("block data validation per type", () => {
  assert.doesNotThrow(() => parseBlockData("INFO_CARD", { title: "T", text: "x", variant: "TIP" }));
  assert.doesNotThrow(() => parseBlockData("VIDEO", {})); // media optional at draft
  assert.throws(() => parseBlockData("CHECKLIST", { items: [] })); // min 1
  assert.equal(safeParseBlockData("NOPE", {}).success, false);
});

test("rich text: plain ⇄ structured round-trip (no raw HTML)", () => {
  const plain = "# Заголовок\nОбычный **жирный** и *курсив*\n- пункт 1\n- пункт 2\n> цитата";
  const doc = plainToRichDoc(plain);
  assert.equal(doc[0].type, "heading");
  assert.ok(doc.some((n) => n.type === "bulletList"));
  assert.ok(doc.some((n) => n.type === "quote"));
  // bold/italic captured as structured spans (not HTML tags)
  const flat = JSON.stringify(doc);
  assert.equal(flat.includes("<"), false);
  assert.ok(flat.includes('"bold":true'));
  // round-trips back to the same markup
  assert.equal(richDocToPlain(doc).includes("**жирный**"), true);
});

/* ---------------- integration scenarios (require Postgres) -------------- */

const skip = { skip: "integration: requires Postgres + generated client" } as const;
test("A: EMPLOYEE cannot access admin writes (requireAdmin → 403)", skip, () => {});
test("B: ADMIN creates program", skip, () => {});
test("C: ADMIN creates day/course/lesson", skip, () => {});
test("D: invalid Lesson cannot publish", skip, () => {});
test("E: valid Lesson publishes", skip, () => {});
test("F: VIDEO with non-READY media blocks publish", skip, () => {});
test("I: signed upload creates UPLOADING MediaAsset", skip, () => {});
test("J: complete media → READY", skip, () => {});
test("Q: completion awards XP once", skip, () => {});
test("R: double completion does not duplicate XP (unique constraint)", skip, () => {});
test("U: preview does not modify progress", skip, () => {});
test("V: archive does not hard-delete", skip, () => {});
