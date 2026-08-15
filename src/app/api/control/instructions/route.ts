import type { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/server/authz";
import { jsonOk, handleError, readJson } from "@/lib/server/http";
import { instructionCreateSchema } from "@/lib/server/knowledge-schemas";
import { listInstructions, listInstructionCategories, createInstruction } from "@/lib/server/knowledge-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const url = new URL(req.url);
    const [instructions, categories] = await Promise.all([
      listInstructions({
        categoryId: url.searchParams.get("categoryId") ?? undefined,
        status: url.searchParams.get("status") ?? undefined,
        q: url.searchParams.get("q") ?? undefined,
      }),
      listInstructionCategories(),
    ]);
    return jsonOk({ instructions, categories });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin();
    const input = instructionCreateSchema.parse(await readJson(req));
    const instruction = await createInstruction(admin.id, input);
    return jsonOk({ instruction }, 201);
  } catch (e) {
    return handleError(e);
  }
}
