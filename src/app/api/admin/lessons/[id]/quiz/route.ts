import type { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/server/authz";
import { jsonOk, handleError, readJson } from "@/lib/server/http";
import { quizUpsertSchema } from "@/lib/server/content-schemas";
import { upsertQuiz, deleteQuiz } from "@/lib/server/content-admin";
import { validateQuizStructure } from "@/lib/server/quiz";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** PUT — replace the lesson's quiz. Structural warnings are returned but do not
 * block saving a draft; publish enforces validity. */
export async function PUT(req: NextRequest, ctx: Ctx) {
  try {
    const admin = await requireAdmin();
    const { id } = await ctx.params;
    const input = quizUpsertSchema.parse(await readJson(req));
    const warnings = validateQuizStructure(input);
    const quiz = await upsertQuiz(admin.id, id, input);
    return jsonOk({ quiz, warnings });
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  try {
    const admin = await requireAdmin();
    const { id } = await ctx.params;
    await deleteQuiz(admin.id, id);
    return jsonOk({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
