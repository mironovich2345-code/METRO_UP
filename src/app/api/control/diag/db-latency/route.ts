import { prisma } from "@/lib/server/db";
import { requireSystemAccess } from "@/lib/server/authz";
import { jsonOk, handleError } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Sprint: mini-app-postgres-latency, section 1/2/8 — a TEMPORARY, read-only
 * diagnostic endpoint. This sandbox has no DATABASE_URL/Railway access at
 * all (verified: no .env, no DATABASE_URL in the process environment — see
 * the report's own "Railway topology" section) — every benchmark the task
 * asked for ("run inside the Railway app environment") can only actually
 * execute once this is deployed to Railway and a human with system access
 * hits it. This route IS that benchmark; it does not fabricate numbers.
 *
 * Safety:
 *  - requireSystemAccess() (legacy ADMIN or active PROJECT_ADMIN) — same
 *    gate as the rest of /control's CMS routes. Never reachable by a plain
 *    employee session.
 *  - Read-only everywhere: `SELECT 1`, one indexed read with a `select`
 *    that returns no row content (COUNT only), SHOW max_connections, a
 *    pg_stat_activity COUNT (connection counts only — no query text, no
 *    usernames, no client addresses). No `RateLimitHit` row is created or
 *    mutated — its query SHAPE is reproduced read-only via a COUNT against
 *    its own table, never a write.
 *  - No credentials, connection strings, row data, or PII in the response.
 *
 * DELETE THIS ROUTE once the live numbers have been captured — it is
 * diagnostic scaffolding for this one investigation, not a permanent
 * ops endpoint (matches section 16's "do not create permanent noisy
 * production telemetry" philosophy from the earlier performance sprint,
 * applied here to a diagnostic surface rather than a log line).
 */
async function timeIt<T>(fn: () => Promise<T>): Promise<number> {
  const start = performance.now();
  await fn();
  return performance.now() - start;
}

function stats(samples: number[]) {
  const sorted = [...samples].sort((a, b) => a - b);
  const p95Index = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
  return {
    min: Math.round(sorted[0]),
    median: Math.round(sorted[Math.floor(sorted.length / 2)]),
    p95: Math.round(sorted[p95Index]),
    max: Math.round(sorted[sorted.length - 1]),
    samples: samples.map((s) => Math.round(s)),
  };
}

export async function GET() {
  try {
    await requireSystemAccess();

    // A. SELECT 1 — first (cold) call, then 10 sequential warm calls, then 5
    // calls with a short pause between each (to see if idle connections get
    // reclaimed/re-established, a classic pool-related latency source).
    const coldMs = await timeIt(() => prisma.$queryRaw`SELECT 1`);

    const warmSamples: number[] = [];
    for (let i = 0; i < 10; i++) {
      warmSamples.push(await timeIt(() => prisma.$queryRaw`SELECT 1`));
    }

    const pausedSamples: number[] = [];
    for (let i = 0; i < 5; i++) {
      await new Promise((r) => setTimeout(r, 300));
      pausedSamples.push(await timeIt(() => prisma.$queryRaw`SELECT 1`));
    }

    // B. One trivial indexed read — City is tiny, seeded, non-sensitive, and
    // `clubId`/`id` lookups elsewhere in this app already hit the same kind
    // of small-table index. COUNT only, never row content.
    const indexedReadMs = await timeIt(() => prisma.city.count());

    // C. RateLimitHit's query SHAPE, read-only — same table, same kind of
    // keyed lookup, as a COUNT instead of the real upsert (never mutates).
    const rateLimitShapeMs = await timeIt(() => prisma.rateLimitHit.count());

    // Connection pool / server-side state — safe aggregate counts only.
    let maxConnections: string | null = null;
    let activeConnections: number | null = null;
    try {
      const mc = await prisma.$queryRaw<{ setting: string }[]>`SHOW max_connections`;
      maxConnections = mc[0]?.setting ?? null;
    } catch {
      /* not fatal — report null, never guess */
    }
    try {
      const ac = await prisma.$queryRaw<{ count: bigint }[]>`SELECT count(*)::int AS count FROM pg_stat_activity`;
      activeConnections = ac[0] ? Number(ac[0].count) : null;
    } catch {
      /* some managed Postgres plans restrict pg_stat_activity — report null */
    }

    return jsonOk({
      select1: {
        coldMs: Math.round(coldMs),
        warm: stats(warmSamples),
        paused: stats(pausedSamples),
      },
      indexedReadMs: Math.round(indexedReadMs),
      rateLimitShapeMs: Math.round(rateLimitShapeMs),
      pool: { maxConnections, activeConnections },
      note: "Read-only. No credentials, row data, or PII above. Delete this route once captured.",
    });
  } catch (e) {
    return handleError(e);
  }
}
