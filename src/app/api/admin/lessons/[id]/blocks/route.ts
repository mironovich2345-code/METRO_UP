import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/server/authz";
import { jsonOk, handleError, readJson } from "@/lib/server/http";
import { BLOCK_TYPES } from "@/lib/server/content-schemas";
import { createBlock } from "@/lib/server/content-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  type: z.enum(BLOCK_TYPES),
  data: z.unknown(),
  order: z.number().int().min(0).optional(),
});

/** POST /api/admin/lessons/:id/blocks — append a block to the lesson. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    const { id } = await ctx.params;
    const input = bodySchema.parse(await readJson(req));
    const block = await createBlock(admin.id, id, input.type, input.data, input.order);
    return jsonOk({ block }, 201);
  } catch (e) {
    return handleError(e);
  }
}
