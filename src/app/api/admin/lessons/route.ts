import type { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/server/authz";
import { jsonOk, handleError, readJson } from "@/lib/server/http";
import { lessonCreateSchema } from "@/lib/server/content-schemas";
import { createLesson } from "@/lib/server/content-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin();
    const input = lessonCreateSchema.parse(await readJson(req));
    const lesson = await createLesson(admin.id, input);
    return jsonOk({ lesson }, 201);
  } catch (e) {
    return handleError(e);
  }
}
