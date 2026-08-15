import type { NextRequest } from "next/server";
import { prisma } from "@/lib/server/db";
import { requireAdmin } from "@/lib/server/authz";
import { jsonOk, handleError, readJson } from "@/lib/server/http";
import { programCreateSchema } from "@/lib/server/content-schemas";
import { createProgram } from "@/lib/server/content-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/programs — full tree for the editor. */
export async function GET() {
  try {
    await requireAdmin();
    const programs = await prisma.trainingProgram.findMany({
      orderBy: { order: "asc" },
      include: {
        days: { orderBy: { dayNumber: "asc" } },
        courses: {
          orderBy: { order: "asc" },
          include: {
            lessons: {
              orderBy: { order: "asc" },
              select: { id: true, title: true, slug: true, status: true, order: true, xpReward: true, isRequired: true, durationMinutes: true },
            },
          },
        },
      },
    });
    return jsonOk({ programs });
  } catch (e) {
    return handleError(e);
  }
}

/** POST /api/admin/programs — create a program. */
export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin();
    const input = programCreateSchema.parse(await readJson(req));
    const program = await createProgram(admin.id, input);
    return jsonOk({ program }, 201);
  } catch (e) {
    return handleError(e);
  }
}
