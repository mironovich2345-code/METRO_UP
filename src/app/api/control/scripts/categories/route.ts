import type { NextRequest } from "next/server";
import { requireSharedControlAccess } from "@/lib/server/authz";
import { jsonOk, handleError, readJson } from "@/lib/server/http";
import { categoryCreateSchema } from "@/lib/server/knowledge-schemas";
import { createScriptCategory, listScriptCategories } from "@/lib/server/knowledge-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireSharedControlAccess();
    return jsonOk({ categories: await listScriptCategories() });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const admin = await requireSharedControlAccess();
    const input = categoryCreateSchema.parse(await readJson(req));
    return jsonOk({ category: await createScriptCategory(admin.id, input) }, 201);
  } catch (e) {
    return handleError(e);
  }
}
