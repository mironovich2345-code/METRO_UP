import type { NextRequest } from "next/server";
import { requireSystemAccess } from "@/lib/server/authz";
import { jsonOk, handleError, readJson } from "@/lib/server/http";
import { courseCreateSchema } from "@/lib/server/content-schemas";
import { createCourse } from "@/lib/server/content-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const admin = await requireSystemAccess();
    const input = courseCreateSchema.parse(await readJson(req));
    const course = await createCourse(admin.id, input);
    return jsonOk({ course }, 201);
  } catch (e) {
    return handleError(e);
  }
}
