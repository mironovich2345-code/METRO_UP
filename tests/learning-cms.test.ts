import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatDayLabel,
  dayNeedsTitle,
  plural,
  lessonsWord,
  daysWord,
  sectionsWord,
} from "../src/lib/learning-format";

/**
 * Learning CMS UX v2 — presentation logic. Pure helpers only; the CMS itself is
 * UI over existing admin APIs (DB/HTTP flows are exercised manually — see the
 * final report acceptance list).
 */

/* ------------------------- day label (no «День 1 · День 1») -------------- */

test("formatDayLabel never duplicates the ordinal", () => {
  // Legacy/default title that is literally the ordinal → show ordinal only.
  assert.equal(formatDayLabel(1, "День 1"), "День 1");
  assert.equal(formatDayLabel(2, "день 2"), "День 2");
  assert.equal(formatDayLabel(3, "День  3"), "День 3");
  assert.equal(formatDayLabel(1, ""), "День 1");
  assert.equal(formatDayLabel(1, null), "День 1");
  // A real name → "День N — Название".
  assert.equal(formatDayLabel(1, "Знакомство с MetroFitness"), "День 1 — Знакомство с MetroFitness");
  assert.equal(formatDayLabel(2, "Знание продукта"), "День 2 — Знание продукта");
});

test("dayNeedsTitle flags legacy/ordinal-only titles", () => {
  assert.equal(dayNeedsTitle(1, "День 1"), true);
  assert.equal(dayNeedsTitle(1, ""), true);
  assert.equal(dayNeedsTitle(1, null), true);
  assert.equal(dayNeedsTitle(1, "Знакомство с MetroFitness"), false);
});

/* ----------------------------- russian plurals -------------------------- */

test("plural picks the right russian form", () => {
  assert.equal(lessonsWord(1), "урок");
  assert.equal(lessonsWord(2), "урока");
  assert.equal(lessonsWord(5), "уроков");
  assert.equal(lessonsWord(11), "уроков");
  assert.equal(lessonsWord(21), "урок");
  assert.equal(daysWord(1), "день");
  assert.equal(daysWord(3), "дня");
  assert.equal(daysWord(7), "дней");
  assert.equal(sectionsWord(2), "раздела");
  assert.equal(plural(0, ["a", "b", "c"]), "c");
});
