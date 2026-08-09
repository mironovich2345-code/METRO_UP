import type { NextRequest } from "next/server";
import { prisma } from "@/lib/server/db";
import { requireAdmin } from "@/lib/server/authz";
import { jsonOk, jsonError, handleError, readJson } from "@/lib/server/http";
import { lessonUpdateSchema } from "@/lib/server/content-schemas";
import { updateLesson } from "@/lib/server/content-admin";
import { validateLessonForPublish } from "@/lib/server/publish";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** GET — full lesson for the editor (raw blocks + quiz WITH answer keys, admin-only). */
export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    await requireAdmin();
    const { id } = await ctx.params;
    const lesson = await prisma.lesson.findUnique({
      where: { id },
      include: {
        course: { include: { program: true, trainingDay: true } },
        blocks: { orderBy: { order: "asc" } },
        quiz: { include: { questions: { orderBy: { order: "asc" }, include: { options: { orderBy: { order: "asc" } } } } } },
      },
    });
    if (!lesson) return jsonError(404, "lesson_not_found");
    const publishErrors = await validateLessonForPublish(id);
    return jsonOk({ lesson, publishErrors });
  } catch (e) {
    return handleError(e);
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const admin = await requireAdmin();
    const { id } = await ctx.params;
    const input = lessonUpdateSchema.parse(await readJson(req));
    const lesson = await updateLesson(admin.id, id, input);
    return jsonOk({ lesson });
  } catch (e) {
    return handleError(e);
  }
}
