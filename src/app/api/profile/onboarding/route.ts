import type { NextRequest } from "next/server";
import { prisma } from "@/lib/server/db";
import { requireUser } from "@/lib/server/authz";
import { onboardingSchema } from "@/lib/server/schemas";
import { checkClubSelection } from "@/lib/server/network";
import { jsonOk, jsonError, handleError } from "@/lib/server/http";
import { meDTO } from "@/lib/server/dto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/profile/onboarding — persist the employee's onboarding.
 * The server owns careerLevel/accessStatus/onboardingCompleted; any such fields
 * from the client are ignored (schema strips unknown keys).
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();

    const body = await req.json().catch(() => ({}));
    const input = onboardingSchema.parse(body); // strips role/accessStatus/etc.

    const check = await checkClubSelection(input.cityId, input.clubId);
    if (!check.ok) {
      return jsonError(400, "validation_error", {
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
