# Daily Plan v3 — manager workflow (checklists, priority, time hints)

Extends CLUB_MANAGER Control v1 + Daily Plan v2 into a real shift work-plan. No
parallel task system — everything builds on the existing `DailyTask` /
`ClubTaskTemplate` / `materializeDailyPlan` architecture.

## Three task sources → one employee plan

1. **SYSTEM** — METRO-UP-owned tasks only: LEARNING (auto) and SALES (blocked).
   The operational CLIENT_MANAGER work moved OUT of the system catalog into the
   standard club plan.
2. **STANDARD CLUB PLAN** — recurring `ClubTaskTemplate`s the manager configures
   for the club (provisioned production defaults + custom).
3. **ONE-OFF MANAGER TASKS** — ad-hoc `DailyTask`s for a date (promos/campaigns).

The employee sees one merged plan; the technical `source`/`category` is never
exposed (category `MANAGER` renders as a neutral task; `source` is not in the DTO).

## Data model (additive migration `20260814120000_daily_plan_v3_checklist`)

Only additive — a manual SQL review shows **no DROP TABLE/COLUMN/TYPE**; the sole
change to an existing column is `club_task_templates.createdByUserId DROP NOT
NULL` (safe constraint relaxation for provisioned defaults, no data loss).

- `enum DailyTaskPriority { NORMAL, HIGH }`.
- `ClubTaskTemplate += code (stable provisioning id), priority, timeHint,
  checklist Json`, `@@unique([clubId, code])`.
- `DailyTask += priority, timeHint`.
- New `DailyTaskChecklistItem` (`dailyTaskId, itemId, text, required, order,
  done, doneAt`, `@@unique([dailyTaskId, itemId])`).

## Checklist architecture & snapshot semantics

The template's checklist is a JSON definition `[{id,text,required,order}]` (edited
as a whole). At materialization it is **snapshotted** into per-DailyTask
`DailyTaskChecklistItem` rows — a stable `itemId` (copied from the template, never
the text) plus per-item completion. Because completion lives on the DailyTask's
own rows, **editing/disabling a template tomorrow never changes historical
DailyTasks**. `createMany(skipDuplicates)` on the unique keys makes materialization
idempotent (no duplicate tasks or checklist items; double-tap safe).

## Completion logic

- Task WITH a checklist → COMPLETED only when **all required items are done** (if
  no required items, all items). There is no "complete" button; toggling the last
  required item auto-completes (and un-toggling reopens). Endpoint `POST
  /api/plan/tasks/[id]/checklist` verifies **ownership** (the item's task must
  belong to the session user) and is idempotent (single-row item update +
  deterministic recompute).
- Task WITHOUT a checklist → existing manual completion. SYSTEM LEARNING stays
  auto-only; SYSTEM SALES keeps its blocked policy. **No XP** for manager/checklist
  tasks (the XP model for system events is untouched).

## Priority & time hint

Simple `NORMAL | HIGH` priority + an optional informational `timeHint` string
(e.g. "до 14:00") — no scheduler/cron/overdue/notifications. HIGH tasks sort first
and get a subtle brand accent (not warning/error). The default hot-clients task is
`HIGH` + `до 14:00`; the manager can set/clear both on any club template or one-off.

## Production-default CLIENT_MANAGER standard plan

`src/lib/server/club-plan-defaults.ts` — 7 ordered tasks with checklists: Принять
смену · Обработать входящие обращения · Отработать горячих клиентов (HIGH, до
14:00) · Отработать планы и наработки · Отработать базу продлений · Вернуть
клиентов из старой базы (non-required, disableable) · Закрыть смену. No promo
content (those are one-off). No production-default plan for NIGHT_MANAGER /
ADMINISTRATOR (position support kept).

## Provisioning strategy

`ensureClubDefaults(clubId)` inserts the default templates into a club **by stable
`code`, only if the code is absent** — it never UPDATEs existing rows, so a
manager's edits/disables are preserved across deploys/runs (idempotent). Called
lazily from `materializeDailyPlan` (employee open) and manager views, guarded by a
per-process cache + DB `createMany(skipDuplicates)` on `unique(clubId, code)`.

## Control changes

`/control/plan` standard-plan section: numbered sequence with priority/timeHint/
checklist summary, per-task editor (title, description, target, required,
priority, timeHint, full checklist editor), enable/disable, add. SYSTEM tasks are
shown read-only, visually separated. Create-one-off form gains priority, timeHint
and an optional checklist. Manager monitoring: per employee X/Y, a **HIGH**
flag when a high-priority task is unfinished, and checklist progress per task on
expand.

## Employee changes

`/plan`: sequential cards with HIGH accent, timeHint chip, required badge, and an
inline collapsible checklist (progress `X/Y`, tappable items, auto-complete). Home
"План на сегодня": compact summary (X/Y, %) with HIGH / timeHint / checklist
progress on the top tasks and an "Открыть план" CTA.

## Security (all Daily Plan v2 guarantees kept)

CLUB_MANAGER: own club only, own club's employees only, no cross-club assignment
(assignee `clubId` must equal the session club → 403), cannot edit SYSTEM tasks,
no SPM/Admin APIs, actor from session. Employee: may toggle only their OWN task's
checklist item; cannot forge auto-only SYSTEM completion.

## Manual verification on Railway (integration not run here)

Run the acceptance flows against the deployed DB: (1) provisioning appears once
per club and survives a redeploy after a manager edit; (2) edit a template's
checklist → next day's materialized task reflects it while yesterday's snapshot is
unchanged; (3) employee checklist toggle persists across refresh and auto-completes
the task with **no XP**; (4) one-off with checklist reaches only own-club
employees; (5) cross-club assignment and foreign-template edit return 403; (6)
employee cannot toggle another user's checklist item; (7) double-tap a checklist
item — no lost/duplicate completion.
