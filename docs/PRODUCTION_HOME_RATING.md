# Production Home / Rating foundation

Removes all fake/mock data from the employee dashboard. Every number now comes
from PostgreSQL; missing data renders an honest empty state (never a mock value).

## Data sources (production)

| Surface | Source |
|---|---|
| Home | `GET /api/home` → `getHomeDashboard()` (aggregate) |
| Daily plan | `GET /api/plan/today`, `POST /api/plan/tasks/[id]/complete|skip` |
| XP | `getXpBalance()` — `SUM(XPTransaction.amount)`, `today` in app timezone |
| Rating | `GET /api/rating` → latest **PUBLISHED** `MonthlyRating` only |
| Mystery shopper | latest **PUBLISHED** `MysteryShopperResult` only |
| Achievements | `GET /api/achievements` — catalog + `UserAchievement` flags |

Production render tree imports **no** mock module (`src/lib/data.ts`,
`src/domain/rating`, `src/domain/xp`, `src/domain/career`). Those files remain
for dev/tests only; the dead mock-backed components were deleted.

## Daily plan

System tasks are generated idempotently for the app-timezone "today"
(`unique(userId, date, templateId)`). Completion policy (`taskMode`):
- **LEARNING** → automatic (server-only) — completes when a lesson is completed
  that day, or nothing is pending. Cannot be manually forged.
- **SALES** → blocked (placeholder) — "Личный план появится после внесения данных
  СПМ"; stays TODO until the sales subsystem exists. No invented numbers.
- **CLIENTS / SERVICE / SHIFT** → manual (user completes/skips).

CLIENT_MANAGER gets the full 5-task plan; NIGHT_MANAGER / ADMINISTRATOR fall back
to a minimal general plan (learning + shift check + close day) — documented v1
placeholder until their real plans are defined.

**Timezone:** `src/lib/server/time.ts`, `APP_TIMEZONE` (default `Europe/Moscow`).
Not hardcoded to UTC — the plan rolls over at local midnight.

## Rating (formula)

`salesScore = personalFact / personalPlan * 100`, capped at **120**; `plan <= 0`
→ not computable. `finalScore = salesScore*0.70 + mysteryShopperScore*0.30`.
Rounding only at the UI (1 decimal). Ranking includes only real EMPLOYEE users
with a valid profile in a ranking position: **CLIENT_MANAGER, NIGHT_MANAGER**.
**ADMINISTRATOR is excluded** from the sales ranking (not a sales role; not
product-defined) — revisit when the product defines it.

## SPM write policy (fixed)

Only **AppRole.SPM** (in the upcoming Web-LK sprint) will have write access to
`MonthlySalesInput`, `MysteryShopperResult`, and the rating publication workflow.
`CLUB_MANAGER` is read-only on rating data. `ADMIN` may get emergency/audit
capabilities later but is **not** used as the standing author of SPM data. This
sprint ships **no write UI/endpoints** for these models.

## Migration & Railway

Additive migration `20260810120000_production_home_rating_foundation` (7 new
tables; existing users/profiles/content/progress/xp untouched). Applied by the
existing `preDeployCommand = npm run db:migrate:deploy`. Reference data
(achievement definitions, daily templates) self-provisions at runtime; optional
pre-seed: `tsx prisma/seed-production.ts`.

## Left for the next (SPM Web-LK) sprint

- SPM write UI/endpoints for `MonthlySalesInput` + `MysteryShopperResult`.
- Rating publication workflow (DRAFT → READY → PUBLISHED) + rank computation job.
- Wiring the SALES daily task to real sales data (auto-completion).
- Remaining achievement triggers (rating/mystery/sales/adaptation-complete).
- Achievements Home block (currently hidden until awards exist).
