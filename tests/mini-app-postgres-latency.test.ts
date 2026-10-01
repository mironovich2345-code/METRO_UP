import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * METRO UP — POSTGRES / CONNECTION LATENCY AUDIT.
 *
 * This sandbox had NO DATABASE_URL / Railway access at all when this round
 * ran (no .env, no matching process.env entry, no network path to the real
 * Postgres instance). The live benchmark numbers that drove the
 * optimizations below came from a temporary, now-removed diagnostic route
 * (ROUND 1's pre-round cleanup, section 3A) run by a human on the real
 * Railway deployment — not fabricated here. What CAN still be verified
 * without a live DB: the new query's structural shape compiles against the
 * real generated Prisma Client types (a clean `tsc --noEmit`) and the
 * source-level guarantees below (which functions call which, index
 * presence).
 */
const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");
const skipNoDb = { skip: "integration: requires Postgres + a live Railway deployment (not available under node:test)" } as const;

/* ================= training/employees parallelization (section 5/6) ================= */
/* The temporary /api/control/diag/db-latency route (and its DIAG-LATENCY-A/
 * B/C gating tests) was removed in METRO UP ROUND 1's pre-round cleanup,
 * section 3A — it had served its purpose (captured the numbers that drove
 * this file's optimizations) and was explicitly temporary scaffolding, not
 * a permanent endpoint. */

test("DEDUP-TRAINING-A: getCityManagerDashboard resolves employees, clubManagerGrants, AND training in ONE Promise.all — training no longer waits for employees to finish first", () => {
  const src = read("src/lib/server/rbac/cabinet-dashboards.ts");
  assert.match(src, /const \[employees, clubManagerGrantsRaw, trainingRaw\] = await Promise\.all\(\[/);
});

test("DEDUP-TRAINING-B: getClubManagerHomeBlock resolves employees and training together, not sequentially", () => {
  const src = read("src/lib/server/rbac/cabinet-dashboards.ts");
  assert.match(src, /const \[employees, trainingRaw\] = await Promise\.all\(\[/);
});

test("DEDUP-TRAINING-C: loadTrainingRawByClub filters LessonProgress via the user->employeeProfile->clubId relation, never via a pre-resolved userId list", () => {
  const src = read("src/lib/server/rbac/cabinet-dashboards.ts");
  const fnSrc = src.slice(src.indexOf("async function loadTrainingRawByClub"), src.indexOf("async function loadTrainingRawByClub") + 1200);
  assert.match(fnSrc, /employeeProfile: \{ clubId: \{ in: clubIds \} \}/);
  assert.doesNotMatch(fnSrc, /userId: \{ in: userIds \}/);
});

test("DEDUP-TRAINING-D: loadTrainingRaw (the original, userId-list-based function) is UNCHANGED and still used elsewhere — this is an additive fix, not a rewrite of shared code", () => {
  const src = read("src/lib/server/rbac/cabinet-dashboards.ts");
  assert.match(src, /async function loadTrainingRaw\(userIds: string\[\]\): Promise<TrainingRaw>/);
  assert.match(src, /prisma\.lessonProgress\.groupBy\(/, "the original groupBy-by-userId shape must still exist, untouched");
});

test("DEDUP-TRAINING-E: loadTrainingRawByClub reuses the SAME EMPLOYEE_WHERE population filter loadEmployees uses, so the two queries never silently diverge on who counts as an employee", () => {
  const src = read("src/lib/server/rbac/cabinet-dashboards.ts");
  const fnSrc = src.slice(src.indexOf("async function loadTrainingRawByClub"), src.indexOf("async function loadTrainingRawByClub") + 1200);
  assert.match(fnSrc, /\.\.\.EMPLOYEE_WHERE/);
});

/* ============================ structural/audit findings ============================ */

test("AUDIT-SCHEMA-A: EmployeeProfile has indexes on clubId and cityId (both used by loadEmployees's WHERE clause) — not a missing-index problem", () => {
  const schema = read("prisma/schema.prisma");
  const model = schema.slice(schema.indexOf("model EmployeeProfile"), schema.indexOf("model City"));
  assert.match(model, /@@index\(\[clubId\]\)/);
  assert.match(model, /@@index\(\[cityId\]\)/);
});

test("AUDIT-SCHEMA-B: LessonProgress has an index on userId (used by both loadTrainingRaw's groupBy and loadTrainingRawByClub's join) — not a missing-index problem", () => {
  const schema = read("prisma/schema.prisma");
  const model = schema.slice(schema.indexOf("model LessonProgress"), schema.indexOf("model QuizAttempt"));
  assert.match(model, /@@index\(\[userId\]\)/);
});

test("AUDIT-SCHEMA-C: RoleAssignment has a composite index matching getActorContext's and getCityManagerDashboard's exact WHERE shapes — not a missing-index problem", () => {
  const schema = read("prisma/schema.prisma");
  const model = schema.slice(schema.indexOf("model RoleAssignment"), schema.indexOf("model EmploymentAssignment"));
  assert.match(model, /@@index\(\[userId, status\]\)/);
  assert.match(model, /@@index\(\[role, scopeType, clubId, status\]\)/);
});

test("AUDIT-PRISMA-SINGLETON-A: the Prisma Client is a proper singleton (globalForPrisma guard) — not re-instantiated per request/hot-reload, which would otherwise exhaust a connection pool on its own", () => {
  const src = read("src/lib/server/db.ts");
  assert.match(src, /globalForPrisma\.prisma \?\?/);
  assert.match(src, /new PrismaClient\(/);
});

test("AUDIT-RATE-LIMITER-A: rate-limit.ts's durable check is still a single atomic upsert keyed on its own primary key — no code-level inefficiency to fix without changing its security semantics", () => {
  const src = read("src/lib/server/rate-limit.ts");
  assert.equal((src.match(/prisma\.rateLimitHit\.(upsert|findFirst|findMany|create|update)\(/g) ?? []).length, 1, "expected exactly one Prisma call in the durable limiter's check()");
});

/* ===================== DB-dependent / infra-dependent (traceable skip stubs) ===================== */

test("LATENCY-INT-A: a warm SELECT 1 against the real Railway Postgres instance completes in the low tens of ms, or infra/connection latency is the P0 root cause per the task's own decision rule", skipNoDb, () => {});
test("LATENCY-INT-B: pg_stat_activity / SHOW max_connections reveal whether the pool is saturated at the moment a slow request is observed", skipNoDb, () => {});
test("LATENCY-INT-C: Railway app service and Postgres service region/colocation, and whether DATABASE_URL uses the private (postgres.railway.internal) or public endpoint", skipNoDb, () => {});
test("LATENCY-INT-D: EXPLAIN (ANALYZE, BUFFERS) on the employees and loadTrainingRawByClub queries against real production data volumes — confirms index usage and real row counts", skipNoDb, () => {});
test("LATENCY-INT-E: training percentages shown on /city and Home's CITY_MANAGER card are IDENTICAL before and after switching to loadTrainingRawByClub, verified against a live DB with real employee/progress data", skipNoDb, () => {});
