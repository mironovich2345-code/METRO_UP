import { test } from "node:test";
import assert from "node:assert/strict";
import { isChecklistComplete } from "../src/lib/checklist-logic";
import {
  normalizeChecklist,
  checklistSchema,
  managerTaskSchema,
  templateCreateSchema,
} from "../src/lib/server/club-plan-schemas";
import { CLIENT_MANAGER_DEFAULTS } from "../src/lib/server/club-plan-defaults";
import { DAILY_TEMPLATES, templatesForPosition } from "../src/lib/server/daily-plan-catalog";

/**
 * Daily Plan v3 — manager workflow (checklists, priority, timeHint, standard
 * plan). Pure logic + schema + catalog tests here; DB/HTTP + security scenarios
 * are integration skips (see the manual checklist in the final report).
 */

/* ------------------------- checklist completion ------------------------- */

test("checklist completes only when all REQUIRED items are done", () => {
  assert.equal(isChecklistComplete([]), false);
  assert.equal(isChecklistComplete([{ required: true, done: false }]), false);
  assert.equal(isChecklistComplete([{ required: true, done: true }, { required: false, done: false }]), true);
  assert.equal(isChecklistComplete([{ required: true, done: true }, { required: true, done: false }]), false);
  // no required items → all must be done
  assert.equal(isChecklistComplete([{ required: false, done: true }, { required: false, done: false }]), false);
  assert.equal(isChecklistComplete([{ required: false, done: true }]), true);
});

/* --------------------------- stable item ids ---------------------------- */

test("normalizeChecklist keeps provided ids and assigns stable ids to new items", () => {
  const out = normalizeChecklist([
    { id: "keep-1", text: "A", required: true },
    { text: "B", required: false }, // no id → assigned
  ]);
  assert.equal(out[0].id, "keep-1");
  assert.match(out[1].id, /^custom-/);
  assert.equal(out[0].order, 1);
  assert.equal(out[1].order, 2);
  assert.equal(out[1].required, false);
  assert.deepEqual(normalizeChecklist(undefined), []);
});

test("checklist schema rejects empty item text; defaults required=true", () => {
  assert.equal(checklistSchema.safeParse([{ text: "ok" }]).success, true);
  assert.equal(checklistSchema.safeParse([{ text: "" }]).success, false);
  const parsed = checklistSchema.parse([{ text: "x" }]);
  assert.equal(parsed[0].required, true);
});

/* ---------------------- production-default CM plan ---------------------- */

test("CLIENT_MANAGER default plan: 7 ordered tasks with stable unique codes", () => {
  assert.equal(CLIENT_MANAGER_DEFAULTS.length, 7);
  const codes = CLIENT_MANAGER_DEFAULTS.map((d) => d.code);
  assert.equal(new Set(codes).size, 7); // unique stable codes (provisioning identity)
  assert.deepEqual(
    CLIENT_MANAGER_DEFAULTS.map((d) => d.title),
    [
      "Принять смену",
      "Обработать входящие обращения",
      "Отработать горячих клиентов",
      "Отработать планы и наработки",
      "Отработать базу продлений",
      "Вернуть клиентов из старой базы",
      "Закрыть смену",
    ],
  );
});

test("hot-clients task is HIGH with 'до 14:00'; checklist item ids stable & unique", () => {
  const hot = CLIENT_MANAGER_DEFAULTS.find((d) => d.code === "CM_STD_HOT")!;
  assert.equal(hot.priority, "HIGH");
  assert.equal(hot.timeHint, "до 14:00");
  assert.deepEqual(hot.checklist.map((c) => c.text), ["Брони", "Вчерашние брони", "Сегодняшние лиды", "Рассрочка", "АЗ"]);
  // all item ids across all defaults are unique and stable (not the text)
  const allIds = CLIENT_MANAGER_DEFAULTS.flatMap((d) => d.checklist.map((c) => c.id));
  assert.equal(new Set(allIds).size, allIds.length);
  assert.ok(allIds.every((id) => /^[a-z]+-\d+$/.test(id)));
});

test("'Вернуть клиентов из старой базы' is non-required (manager may disable)", () => {
  const old = CLIENT_MANAGER_DEFAULTS.find((d) => d.code === "CM_STD_OLDBASE")!;
  assert.equal(old.required, false);
});

/* ------------------- SYSTEM templates reduced to LMS -------------------- */

test("SYSTEM CLIENT_MANAGER templates are learning+sales only (operational = club plan)", () => {
  const cm = templatesForPosition("CLIENT_MANAGER");
  assert.deepEqual(cm.map((t) => t.category).sort(), ["LEARNING", "SALES"]);
  assert.equal(DAILY_TEMPLATES.some((t) => t.code === "CM_CLIENTS"), false);
  assert.equal(DAILY_TEMPLATES.some((t) => t.code === "CM_SHIFT_CLOSE"), false);
});

/* ----------------------- schema accepts new fields ---------------------- */

test("manager task + template schemas accept priority/timeHint/checklist", () => {
  const task = managerTaskSchema.safeParse({
    title: "Прозвонить клиентов", date: "2026-08-14", priority: "HIGH", timeHint: "до 14:00",
    checklist: [{ text: "Проверить базу" }, { text: "Выполнить звонки" }],
    target: { type: "ALL_MANAGERS" },
  });
  assert.equal(task.success, true);
  const tpl = templateCreateSchema.safeParse({ title: "Принять смену", priority: "HIGH", checklist: [{ text: "Проверить кассу", required: true }] });
  assert.equal(tpl.success, true);
});

/* --------------- integration scenarios (require Postgres) --------------- */

const skip = { skip: "integration: requires Postgres + running server" } as const;
test("materialization snapshots checklist onto DailyTask (idempotent, no dup items)", skip, () => {});
test("editing a template does not change historical DailyTask checklist snapshots", skip, () => {});
test("task auto-COMPLETED after last required checklist item; toggling back reopens", skip, () => {});
test("optional checklist item does not block completion", skip, () => {});
test("provisioning is idempotent (no duplicate default templates on re-run)", skip, () => {});
test("provisioning does NOT overwrite a manager's customization of a default", skip, () => {});
test("employee can toggle only OWN task's checklist item (ownership)", skip, () => {});
test("cross-club: manager cannot assign / edit another club's data → 403", skip, () => {});
test("SYSTEM tasks/templates are read-only for the manager", skip, () => {});
test("no XP awarded for completing a manager/checklist task", skip, () => {});
test("double-tap / repeated toggle does not lose completion or duplicate", skip, () => {});
