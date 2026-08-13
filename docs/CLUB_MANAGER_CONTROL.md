# CLUB_MANAGER Control v1 + Daily Plan v2

A club manager manages their club's operational tasks in the Web Control portal;
employees receive one unified real plan in the Telegram Mini App. Built on the
existing daily-plan system (no parallel task system).

## Data model (additive migration `20260813120000_club_manager_daily_plan`)

- `ClubTaskTemplate` (new): `clubId, title, description?, targetPosition?
  (EmployeePosition | null = all managers), required, defaultOrder, isActive,
  createdByUserId`. Recurring daily task definitions owned by a club.
- `DailyTask` (extended): `+ clubTaskTemplateId?`, `+ createdByUserId?`,
  `+ required` and a second unique key `@@unique([userId, date,
  clubTaskTemplateId])` so club-template materialization is idempotent alongside
  the existing `@@unique([userId, date, templateId])` for system tasks.
- Enums: `DailyTaskCategory += MANAGER`, `DailyTaskSource += MANAGER`.
- No new roles (Prisma `AppRole` unchanged).

## Permissions matrix (server-enforced)

| Role | Control entry | Learning/Media | Daily Plan + Team | Sales/Mystery/Rating |
|---|---|---|---|---|
| ADMIN | ✅ | ✅ | ✅ | ✅ |
| SPM | ✅ | ❌ | ❌ | ✅ |
| CLUB_MANAGER | ✅ | ❌ | ✅ (own club) | ❌ |
| EMPLOYEE | ❌ | ❌ | ❌ | ❌ |

`src/lib/roles.ts`: `canAccessControl` = ADMIN|SPM|CLUB_MANAGER (portal entry);
`canManageClub` = CLUB_MANAGER|ADMIN (plan/team). **`canAccessSpm` is
intentionally NOT widened to CLUB_MANAGER** — general Control access is separate
from module permissions. All `/api/control/*` routes call `requireClubManager()`
(CLUB_MANAGER|ADMIN); the **clubId is always derived from the server session's
EmployeeProfile — never from the client**.

## Materialization logic

`materializeDailyPlan({userId, position, clubId}, date)` (in `daily-plan.ts`) is
called by both the employee's `getPlanToday` and the manager's plan/team views.
It idempotently `createMany(skipDuplicates)`:
1. SYSTEM templates for the position (existing behaviour, unchanged), and
2. active `ClubTaskTemplate`s of the club whose `targetPosition` is null (all) or
   matches the user's position.

One-off manager tasks are created directly as `DailyTask` rows (source MANAGER,
category MANAGER). Tasks are **day snapshots**: editing/disabling a template later
never rewrites already-materialized rows (title/description are copied at
materialization). System tasks are never editable by a manager.

## Routes / API

- Web: `/control/plan` (club plan, create task, standard-plan templates),
  `/control/team` (club employees + plan/lesson progress). Rendered in the unified
  `ControlShell`; nav shows «План дня»/«Команда» for managers.
- API (all `requireClubManager`, club-scoped): `GET /api/control/plan?date`,
  `POST /api/control/plan/tasks`, `DELETE /api/control/plan/tasks/[id]` (one-off,
  non-completed only), `POST /api/control/templates`, `PATCH
  /api/control/templates/[id]` (edit / enable-disable), `POST
  /api/control/templates/reorder`, `GET /api/control/team`.

## Employee Mini App

`Home «План на сегодня»` and `/plan` use the same unified `getPlanToday` list
(system + club templates + one-off). Employees never see the technical
`SYSTEM/MANAGER` source (not in the DTO); category `MANAGER` renders as «Задача»;
`required` shows a badge. Manual manager tasks are employee-completable; SYSTEM
LEARNING stays auto-only; SYSTEM SALES keeps its policy. **No XP** is awarded for
completing a manager task (XP model for system events is unchanged).

## Acceptance flow

Manager signs into Web Control → sees only their club → «Создать задачу»
"Обзвонить клиентов с заканчивающейся картой" → «Всем менеджерам клуба» → today →
employees open the Mini App → the task appears in «План на сегодня» → employee
marks it done → after refresh it persists → manager sees X/Y and the completed
task in `/control/plan`.

Cross-club attempt: `POST /api/control/plan/tasks` with a `USER` target from
another club → server rejects with **403 `employee_not_in_club`** (the assignee's
`clubId` must equal the actor's session club).

## History

`DailyTask` is a per-day snapshot; disabling/editing a template today does not
change completed plans of previous days. Nothing is hard-deleted except a
non-completed one-off manager task explicitly removed by the manager.
