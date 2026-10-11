import type { NextRequest } from "next/server";
import { requireActiveAccess, hasSystemAccessForUser } from "@/lib/server/authz";
import { requireNoActiveViewAs } from "@/lib/server/rbac/view-as";
import { resolveEffectiveReadContext } from "@/lib/server/rbac/effective-context";
import { selfProfileUpdateSchema, zodFieldErrors } from "@/lib/server/schemas";
import { loadOpenEmploymentStartedAt, updateOwnDisplayName } from "@/lib/server/self-profile";
import { buildSelfProfileUpdate } from "@/lib/profile-edit";
import { jsonOk, jsonError, handleError, readJson } from "@/lib/server/http";
import { meDTO } from "@/lib/server/dto";
import { getRateLimiter } from "@/lib/server/rate-limit";
import type { SelfProfileDTO } from "@/lib/api/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Sprint: LIVE QA QA-02 — the employee's OWN Profile.
 *
 * Identity is ALWAYS the verified session (requireActiveAccess -> the real
 * actor). Neither method accepts a user/employee/telegram id from the client,
 * so there is nothing a request could put in to reach another employee.
 *
 * Access: requireActiveAccess — the same rule the self-only avatar routes
 * use and that authz.ts documents for "reading one's own profile": an
 * EmployeeProfile is required (409 otherwise), SUSPENDED is refused (403
 * APP_TEMPORARILY_UNAVAILABLE), PENDING_APPROVAL/LIMITED/FULL may proceed.
 */

/**
 * GET — what the Profile needs beyond AppUserDTO: the real employment start
 * date. During a MANAGER/CLUB_MANAGER persona preview the Mini App renders
 * the synthetic persona (see /api/auth/me), and a persona has no employment
 * history — so this returns null rather than mixing the real actor's dates
 * into the persona's screen (the same rule every read route follows during a
 * preview).
 */
export async function GET() {
  try {
    const user = await requireActiveAccess();
    const effective = await resolveEffectiveReadContext(user);
    const profile: SelfProfileDTO = {
      employmentStartedAt: effective.isPreviewing ? null : await loadOpenEmploymentStartedAt(user.id),
    };
    return jsonOk({ profile });
  } catch (error) {
    return handleError(error);
  }
}

/**
 * PATCH — change the employee's own name. Body: `{ firstName, lastName? }`
 * only; any other key is stripped (selfProfileUpdateSchema) and the write is
 * built field-by-field (buildSelfProfileUpdate) so only `displayName` can
 * ever change. A persona preview can never edit anything: the middleware
 * already rejects every write while one is active, and requireNoActiveViewAs
 * re-checks it here (same 403 VIEW_AS_READ_ONLY) in case that guard is ever
 * bypassed. Returns the fresh AppUserDTO so the client applies the confirmed
 * name at once, with no second /api/auth/me round trip.
 */
export async function PATCH(req: NextRequest) {
  try {
    const user = await requireActiveAccess();
    await requireNoActiveViewAs(user);

    const rl = await getRateLimiter().check(`profile-update:${user.id}`, { max: 20, windowMs: 60_000 });
    if (!rl.allowed) return jsonError(429, "rate_limited", { retryAfterSeconds: rl.retryAfterSeconds });

    const parsed = selfProfileUpdateSchema.safeParse(await readJson(req));
    if (!parsed.success) return jsonError(400, "INVALID_INPUT", { fields: zodFieldErrors(parsed.error) });

    const update = buildSelfProfileUpdate(parsed.data);
    if (!update.ok) return jsonError(400, "INVALID_INPUT", { fields: update.fields });

    const updated = await updateOwnDisplayName(user, update.data);
    return jsonOk({ user: meDTO(updated, await hasSystemAccessForUser(updated)) });
  } catch (error) {
    return handleError(error);
  }
}
