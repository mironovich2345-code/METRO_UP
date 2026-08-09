import type { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/server/authz";
import { jsonOk, handleError, readJson } from "@/lib/server/http";
import { dayCreateSchema } from "@/lib/server/content-schemas";
import { createDay } from "@/lib/server/content-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin();
    const input = dayCreateSchema.parse(await readJson(req));
    const day = await createDay(admin.id, input);
    return jsonOk({ day }, 201);
  } catch (e) {
    return handleError(e);
  }
}
