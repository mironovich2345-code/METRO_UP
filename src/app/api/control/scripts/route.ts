import type { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/server/authz";
import { jsonOk, handleError, readJson } from "@/lib/server/http";
import { scriptCreateSchema } from "@/lib/server/knowledge-schemas";
import { listScripts, listScriptCategories, createScript } from "@/lib/server/knowledge-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const url = new URL(req.url);
    const [scripts, categories] = await Promise.all([
      listScripts({
        categoryId: url.searchParams.get("categoryId") ?? undefined,
        status: url.searchParams.get("status") ?? undefined,
        q: url.searchParams.get("q") ?? undefined,
      }),
      listScriptCategories(),
    ]);
    return jsonOk({ scripts, categories });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin();
    const input = scriptCreateSchema.parse(await readJson(req));
    const script = await createScript(admin.id, input);
    return jsonOk({ script }, 201);
  } catch (e) {
    return handleError(e);
  }
}
