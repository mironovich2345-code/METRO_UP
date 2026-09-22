import { test } from "node:test";

/**
 * Sprint 1 / Phase 2D — EffectiveReadContext / synthetic read persona
 * (src/lib/server/rbac/effective-context.ts) and its wiring into
 * /api/auth/me + the Mini-App read routes (home, plan/today, academy/*,
 * knowledge/scripts, xp, rating, achievements).
 *
 * The DECISION logic this phase adds (startViewAsSchema's previewPositionId
 * rules, the CLUB_MANAGER/MANAGER role→AppRole mapping, isPersonaPreview's
 * MANAGER/CLUB_MANAGER-only filter) is covered by real, DB-free tests —
 * SCHEMA-E/F/G in rbac.test.ts, and the previewPositionId round-trip/tamper/
 * legacy-token-default cases in foundation.test.ts's view-as section.
 *
 * Everything below needs resolveViewContext() (cookies() + a live
 * RoleAssignment lookup) and/or a real Prisma connection to exercise for
 * real, matching this codebase's established convention for integration
 * scenarios (see rbac.test.ts's VIEWAS-G..K, rate-limit.test.ts).
 */

test(
  "EFFCTX-A: startViewAs() rejects starting a preview when the REAL actor's " +
    "own EmployeeProfile.accessStatus is present and not FULL (LIMITED/" +
    "PENDING_APPROVAL/SUSPENDED) — a restricted CITY_MANAGER cannot preview " +
    "others while their own access is restricted; a CITY_MANAGER with NO " +
    "EmployeeProfile at all (the common case for a network-tier-only role) is " +
    "unaffected, since accessStatus doesn't apply to them",
  { skip: "integration: requires Postgres" },
  () => {},
);

test(
  "EFFCTX-B: GET /api/auth/me during an active MANAGER/CLUB_MANAGER preview " +
    "returns the synthetic persona's profile (id NOT the real actor's id, " +
    "clubId/cityId/positionId matching the preview scope, accessStatus=FULL, " +
    "onboardingCompleted=true) plus viewContext={previewRole, realRoleLabel: " +
    "'Ст. города'} — and during a CITY_MANAGER self-preview (or no preview) " +
    "returns the REAL user with viewContext=null",
  { skip: "integration: requires Postgres + running server (cookies())" },
  () => {},
);

test(
  "EFFCTX-C: the synthetic persona's accessStatus is ALWAYS 'FULL', " +
    "independent of the real CITY_MANAGER's own accessStatus — a preview " +
    "never inherits or simulates a restricted (LIMITED/PENDING_APPROVAL/" +
    "SUSPENDED) employee, by construction (effective-context.ts hardcodes it, " +
    "never reads it off realUser)",
  { skip: "integration: requires Postgres" },
  () => {},
);

test(
  "EFFCTX-D: REGRESSION — GET /api/home and GET /api/plan/today during a " +
    "preview do NOT insert any DailyTask row (getHomeDashboardFor/" +
    "getPlanTodayFor skip getPlanToday()'s materialization entirely for the " +
    "synthetic persona, whose id has no matching `users` row — calling the " +
    "real path would throw a foreign-key violation on daily_tasks.userId); " +
    "the response is 200 with an honest empty plan {total:0, completed:0, " +
    "tasks:[]}, and dailyTask.count() before/after is unchanged",
  { skip: "integration: requires Postgres + running server" },
  () => {},
);

test(
  "EFFCTX-E: GET /api/knowledge/scripts during a MANAGER preview with " +
    "previewPositionId=CLIENT_MANAGER or NIGHT_MANAGER returns scripts " +
    "(canAccessScripts is position-eligible); previewPositionId=ADMINISTRATOR " +
    "returns 403 forbidden — the position picked at startViewAs time, not a " +
    "guessed default, drives this",
  { skip: "integration: requires Postgres + running server" },
  () => {},
);

test(
  "EFFCTX-F: GET /api/xp, /api/rating, /api/achievements, /api/academy/state " +
    "during a preview all key off the synthetic persona's id and correctly " +
    "return zeroed/empty results (0 XP, no rating row, no achievements, no " +
    "lesson progress) — never the real CITY_MANAGER's own data, and never " +
    "another real employee's",
  { skip: "integration: requires Postgres + running server" },
  () => {},
);

test(
  "EFFCTX-G: a preview session (start -> several reads -> end) creates ZERO " +
    "new rows in `users` or `employee_profiles` — the synthetic persona is " +
    "never persisted; only UserAuditLog gains the VIEW_AS_STARTED/ENDED pair " +
    "(already covered by VIEWAS-K), and RoleAssignment/EmployeeProfile row " +
    "counts for the synthetic id (00000000-0000-0000-0000-000000000000) stay " +
    "at zero throughout",
  { skip: "integration: requires Postgres" },
  () => {},
);

test(
  "EFFCTX-H: SECURITY — resolveEffectiveReadContext() never grants more than " +
    "the real actor's CURRENT authorization even with a still-valid-looking " +
    "but now-out-of-scope cookie: if a PROJECT_ADMIN revokes the CITY_MANAGER's " +
    "CITY_MANAGER grant (or narrows it) mid-preview, the very next " +
    "/api/auth/me call falls back to isPreviewing=false / the real user " +
    "(resolveViewContext's existing per-call re-validation, unchanged this " +
    "phase — effective-context.ts adds no new trust decision, only what a " +
    "confirmed-valid preview renders)",
  { skip: "integration: requires Postgres + running server" },
  () => {},
);

test(
  "EFFCTX-I: mutation routes remain blocked during a Mini-App preview " +
    "(POST /api/academy/lessons/:slug/complete, POST /api/plan/tasks/:id/" +
    "complete) with 403 VIEW_AS_READ_ONLY — already covered generically by " +
    "middleware.test.ts's MW-D (global guard, not route-specific), restated " +
    "here as the Phase 2D acceptance criterion: previewing a MANAGER never " +
    "lets a CITY_MANAGER complete that MANAGER's lessons/tasks",
  { skip: "integration: requires Postgres + running server" },
  () => {},
);

test(
  "EFFCTX-J: the Mini-App ViewAsBanner (app-shell-frame.tsx) renders on every " +
    "non-control route while user.viewContext is non-null, and its 'end " +
    "preview' button calls appUser.refresh() (re-fetches /api/auth/me) rather " +
    "than router.refresh() — a purely client-rendered tree has no Server " +
    "Component to re-run, so router.refresh() alone would leave the stale " +
    "persona's data on screen after ending",
  { skip: "integration: requires a running server + browser/DOM (component behavior)" },
  () => {},
);
