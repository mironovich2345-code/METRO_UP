# SPM control panel (feat/spm-control-panel)

Web LK for the SPM role: enter sales, enter mystery-shopper results, calculate and
publish the monthly rating. After publish, employees see the rating and mystery
result in the Telegram Mini App.

## Routes

- `/spm` (overview), `/spm/sales`, `/spm/mystery`, `/spm/rating` — SPM panel
  (route group `(panel)`, server-guarded by `requireSPM`; ADMIN allowed read/debug).
- `/spm/login` — desktop web sign-in (outside the guard).
- APIs (all `requireSPM`): `/api/spm/overview|employees|sales|mystery|rating`,
  `/api/spm/mystery/[id]/publish`, `/api/spm/eligibility`,
  `/api/spm/rating/calculate|publish|reopen`, and `/api/auth/telegram-web`.

## Auth strategy

Reuses the existing HttpOnly Telegram session + `requireSPM()` (server-enforced on
every page and API — no frontend-only guards). For **desktop** sign-in there is a
**Telegram Login Widget** flow (`/spm/login` → `/api/auth/telegram-web`), which
verifies the widget hash server-side (secret = SHA256(bot_token)) and opens the
same session — Telegram identity, **no passwords**. It requires the bot domain in
BotFather (`/setdomain`) and `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`. Until configured,
an SPM can open the Mini App in Telegram to establish the session, then visit
`/spm` (like ADMIN → `/admin`). The panel is responsive down to 430px.

Role assignment: SPM is granted by an **ADMIN in the DB** (no self-registration).
`UPDATE users SET role='SPM' WHERE "telegramUsername"='...';`

## Money & formula

Sales money (`personalPlan`, `personalFact`) is stored as **integer whole rubles**
— exact, never a JS-float source of truth. `salesScore` is **server-derived** (SPM
can never submit it): `fact/plan*100`, capped **120**, `null` when `plan<=0`.
`finalScore = salesScore*0.70 + mysteryShopperScore*0.30` (rounded to 1 decimal
only in the UI).

## Readiness, eligibility, tie-breaker

An employee is READY when they have sales (`plan>0`, `salesScore!=null`) **and** a
PUBLISHED mystery result for the period. SPM can exclude an employee via
`RatingEligibility` (default eligible) — excluding a newcomer doesn't block the
period. Tie-breaker (deterministic): finalScore → mysteryScore → salesScore →
`User.createdAt` → id.

## Multiple mystery checks (policy)

The schema stores **one** MysteryShopperResult per (employee, period) — so the
rating uses that single PUBLISHED result. If multiple checks per period are needed
later, relax the unique constraint and pick the **latest PUBLISHED** (the rating
query already filters `status=PUBLISHED`; the read model can `orderBy checkedAt desc`).

## Period lifecycle & correction

`RatingPeriod` status DRAFT → READY (after `calculate`) → PUBLISHED (after
`publish`). Only **completed calendar months** are publishable (current month
blocked). Publish is transactional + idempotent (double-click safe). **Reopen**
(PUBLISHED → DRAFT) is the V1 correction path — no snapshot versioning, so a
reopened rating disappears from employees until re-published (documented
trade-off). Nothing is hard-deleted; recalculation only replaces transient DRAFT
MonthlyRating rows (never PUBLISHED history).

## Audit

Every SPM write is recorded in `RatingAuditLog` (SALES_*, MYSTERY_*,
ELIGIBILITY_CHANGE, RATING_CALCULATE/PUBLISH/REOPEN) with actor + before/after.

## Achievements triggered

- Mystery publish → MYSTERY_90/95/100.
- Rating publish → FIRST_RATING, TOP_10, TOP_3, BEST_MANAGER, BIGGEST_GROWTH, and
  sales PLAN_100/110/PLAN_STREAK_3 for ranked users. All idempotent.

## First real cycle

1. Grant SPM: `UPDATE users SET role='SPM' WHERE "telegramUsername"='...';`
2. `/spm/sales` → pick the previous month → enter plan/fact → Save.
3. `/spm/mystery` → enter score/date/comment → **Опубликовать** per employee.
4. `/spm/rating` → **Рассчитать рейтинг** (period → READY) → review → **Опубликовать**.
5. Employees: `/ranking` shows the period; Home rating + mystery cards fill in;
   achievements are awarded.

## What remains before Metric AI

- CLUB_MANAGER read-only rating views; ADMIN emergency/audit tooling.
- Multiple mystery checks (average/best/weighted) if the product needs it.
- Snapshot versioning for reopened published ratings.
- User-management UI for role assignment (replacing manual DB updates).
