import type { NextRequest } from "next/server";
import { prisma } from "@/lib/server/db";
import { requireUser } from "@/lib/server/authz";
import { onboardingSchema, zodFieldErrors } from "@/lib/server/schemas";
import {
  checkClubSelection,
  type ClubSelectionDiagnostics,
} from "@/lib/server/network";
import { jsonOk, jsonError, handleError } from "@/lib/server/http";
import { meDTO } from "@/lib/server/dto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * TEMPORARY diagnostic log for 400s on onboarding. Emits only non-sensitive
 * booleans and the (public) city/club/position identifiers — never telegramId,
 * username, initData, cookies, or secrets. Remove once the 400 is resolved.
 */
function logOnboardingDecision(fields: {
  authUserPresent: boolean;
  displayNameValid: boolean;
  cityId: string;
  clubId: string;
  positionId: string;
  positionValid: boolean;
  zodOk: boolean;
  outcome: string;
  diagnostics: ClubSelectionDiagnostics | null;
}) {
  console.warn("[onboarding][diag]", JSON.stringify(fields));
}

/** Shorten an unknown request value to a safe, non-secret label for logging. */
function safeId(value: unknown): string {
  return typeof value === "string" ? value.slice(0, 64) : "";
}

/**
 * POST /api/profile/onboarding — persist the employee's onboarding.
 * The server owns careerLevel/accessStatus/onboardingCompleted; any such fields
 * from the client are ignored (schema strips unknown keys).
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();

    const body = await req.json().catch(() => ({}));
    const raw = (body ?? {}) as Record<string, unknown>;
    const parsed = onboardingSchema.safeParse(body); // strips role/accessStatus/etc.

    if (!parsed.success) {
      // Zod rejected input. INVALID_POSITION when the position enum is the only
      // problem; INVALID_INPUT otherwise. Same validation rules as before.
      const badFields = new Set(parsed.error.issues.map((i) => String(i.path[0] ?? "")));
      const code =
        badFields.size === 1 && badFields.has("positionId")
          ? "INVALID_POSITION"
          : "INVALID_INPUT";
      logOnboardingDecision({
        authUserPresent: true,
        displayNameValid: !badFields.has("displayName"),
        cityId: safeId(raw.cityId),
        clubId: safeId(raw.clubId),
        positionId: safeId(raw.positionId),
        positionValid: !badFields.has("positionId"),
        zodOk: false,
        outcome: code,
        diagnostics: null,
      });
      return jsonError(400, code, { fields: zodFieldErrors(parsed.error) });
    }

    const input = parsed.data;

    const check = await checkClubSelection(input.cityId, input.clubId);
    logOnboardingDecision({
      authUserPresent: true,
      displayNameValid: true,
      cityId: input.cityId,
      clubId: input.clubId,
      positionId: input.positionId,
      positionValid: true,
      zodOk: true,
      outcome: check.ok ? "OK" : check.code,
      diagnostics: check.diagnostics,
    });
    if (!check.ok) {
      return jsonError(400, check.code, {
        fields: { [check.field]: check.message },
      });
    }

    await prisma.$transaction(async (tx) => {
      await tx.employeeProfile.upsert({
        where: { userId: user.id },
        update: {
          cityId: input.cityId,
          clubId: input.clubId,
          positionId: input.positionId,
          // careerLevel / accessStatus / onboardingCompleted are server-owned.
        },
        create: {
          userId: user.id,
          cityId: input.cityId,
          clubId: input.clubId,
          positionId: input.positionId,
          careerLevel: "NEWCOMER",
          accessStatus: "LIMITED",
          onboardingCompleted: true,
        },
      });
      await tx.user.update({
        where: { id: user.id },
        data: { displayName: input.displayName },
      });
    });

    const updated = await prisma.user.findUnique({
      where: { id: user.id },
      include: { employeeProfile: true },
    });

    return jsonOk({ user: meDTO(updated!) });
  } catch (error) {
    return handleError(error);
  }
}
