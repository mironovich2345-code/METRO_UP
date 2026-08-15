import type { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/server/authz";
import { jsonOk, handleError, readJson } from "@/lib/server/http";
import { userUpdateSchema } from "@/lib/server/user-admin-schemas";
import { getUser, updateUser } from "@/lib/server/user-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await ctx.params;
    return jsonOk({ user: await getUser(id) });
  } catch (e) {
    return handleError(e);
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    // Actor is derived ONLY from the verified session — never from the body.
    const admin = await requireAdmin();
    const { id } = await ctx.params;
    const input = userUpdateSchema.parse(await readJson(req));
    return jsonOk({ user: await updateUser(admin.id, id, input) });
  } catch (e) {
    return handleError(e);
  }
}
