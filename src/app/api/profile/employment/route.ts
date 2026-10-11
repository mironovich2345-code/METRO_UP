import type { NextRequest } from "next/server";
import { requireActiveAccess } from "@/lib/server/authz";
import { requireNoActiveViewAs } from "@/lib/server/rbac/view-as";
import { selfEmploymentStartSchema, zodFieldErrors } from "@/lib/server/schemas";
import { updateOwnEmploymentStartDate } from "@/lib/server/self-profile";
import { parseEmploymentStartDate } from "@/lib/employment-date";
import { jsonOk, jsonError, handleError, readJson } from "@/lib/server/http";
import { getRateLimiter } from "@/lib/server/rate-limit";
import type { SelfProfileDTO } from "@/lib/api/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Sprint: LIVE QA QA-04, section A — PUT: the employee sets THEIR OWN
 * "Дата начала работы". Body: `{ startedOn: "YYYY-MM-DD" }` only.
 *
 * Identity is the verified session (requireActiveAccess); the body has no
 * user/employee id, so no other employee can be targeted. SUSPENDED is
 * refused by requireActiveAccess; a MANAGER/CLUB_MANAGER persona preview is
 * refused by the middleware and again by requireNoActiveViewAs (a
 * CITY_MANAGER self-preview is the real actor and may edit their own date,
 * exactly like the name). Real MANAGER, CLUB_MANAGER and CITY_MANAGER users
 * with an EmployeeProfile all reach the same self-only write.
 *
 * Returns the fresh SelfProfileDTO so the Profile applies the confirmed
 * date (and recalculated tenure) at once, without a reload.
 */
export async function PUT(req: NextRequest) {
  try {
    const user = await requireActiveAccess();
    await requireNoActiveViewAs(user);

    const rl = await getRateLimiter().check(`profile-employment:${user.id}`, { max: 20, windowMs: 60_000 });
    if (!rl.allowed) return jsonError(429, "rate_limited", { retryAfterSeconds: rl.retryAfterSeconds });

    const parsed = selfEmploymentStartSchema.safeParse(await readJson(req));
    if (!parsed.success) return jsonError(400, "INVALID_INPUT", { fields: zodFieldErrors(parsed.error) });

    const date = parseEmploymentStartDate(parsed.data.startedOn);
    if (!date.ok) return jsonError(400, date.code, { fields: { startedOn: date.message } });

    const employmentStartedAt = await updateOwnEmploymentStartDate(user, { isoDate: date.isoDate, date: date.date });
    const profile: SelfProfileDTO = { employmentStartedAt };
    return jsonOk({ profile });
  } catch (error) {
    return handleError(error);
  }
}
