import type { NextRequest } from "next/server";
import { requireUser } from "@/lib/server/authz";
import { jsonOk, jsonError, handleError, readJson } from "@/lib/server/http";
import { getRateLimiter } from "@/lib/server/rate-limit";
import {
  createRoleAssignmentSchema,
  listRoleAssignmentsQuerySchema,
} from "@/lib/server/rbac/role-assignment-schemas";
import { createRoleAssignment, listRoleAssignments } from "@/lib/server/rbac/role-assignment-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/control/roles — RoleAssignment rows visible to the caller's scope
 * (see role-assignment-service.ts's visibilityFilter). Any authenticated user
 * with at least one active grant may list within their own scope; a plain
 * MANAGER with none gets 403 (never an empty 200 — silence here would look
 * like "nobody is assigned", not "you can't see this").
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    const params = Object.fromEntries(req.nextUrl.searchParams.entries());
    const filter = listRoleAssignmentsQuerySchema.parse(params);
    const rows = await listRoleAssignments(user, filter);
    return jsonOk({ assignments: rows });
  } catch (e) {
    return handleError(e);
  }
}

/**
 * POST /api/control/roles — create a RoleAssignment. Every hierarchy rule
 * (who may assign whom, in what scope) is enforced inside
 * createRoleAssignment() via authorize() — this route only validates shape
 * and rate-limits per acting user.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const rl = await getRateLimiter().check(`role.assign:${user.id}`, { max: 30, windowMs: 60_000 });
    if (!rl.allowed) return jsonError(429, "rate_limited", { retryAfterSeconds: rl.retryAfterSeconds });

    const input = createRoleAssignmentSchema.parse(await readJson(req));
    const created = await createRoleAssignment(user, input);
    return jsonOk({ assignment: created }, 201);
  } catch (e) {
    return handleError(e);
  }
}
