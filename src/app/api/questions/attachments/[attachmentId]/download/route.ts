import type { NextRequest } from "next/server";
import { AuthError, requireActiveAccess } from "@/lib/server/authz";
import { handleError } from "@/lib/server/http";
import { getActorContext } from "@/lib/server/rbac/context";
import { getStorageProvider } from "@/lib/storage/provider";
import { getQuestionAttachmentForDownload } from "@/lib/server/questions/questions-service";
import { contentDispositionForAttachment } from "@/lib/server/questions/questions-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/questions/attachments/[attachmentId]/download — METRO UP ROUND
 * 1, Milestone 3, section 7/9. A DOWNLOAD PROXY, not a redirect: the route
 * never returns a storage URL to the client at all (see
 * getQuestionAttachmentForDownload's own comment — the object store's
 * signed URL embeds `questions/<authorUserId>/...` in its path, which would
 * leak the real author's id to a CITY_MANAGER even for an anonymous
 * question). This route resolves a signed GET URL SERVER-SIDE, fetches the
 * bytes itself, and streams them back under our own domain/path — the
 * client only ever sees `/api/questions/attachments/<attachmentId>/
 * download`, an opaque id with no identity information in it.
 *
 * Authorization is the parent question's canReadQuestion (generic "may this
 * actor read this question" — not inbox-recipient semantics; see
 * getQuestionAttachmentForDownload). 60s signed-URL TTL — short on purpose
 * (vs. the 300s default used for ADMIN document downloads elsewhere), since
 * this proxy is the only thing that ever uses it, immediately, server-side.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ attachmentId: string }> }) {
  try {
    const user = await requireActiveAccess();
    const actor = await getActorContext(user);
    const { attachmentId } = await ctx.params;
    const meta = await getQuestionAttachmentForDownload(actor, attachmentId);

    const signedUrl = await getStorageProvider().createSignedDownloadUrl(meta.storageKey, 60);
    const upstream = await fetch(signedUrl);
    if (!upstream.ok || !upstream.body) {
      throw new AuthError(404, "attachment_not_found", "Файл не найден в хранилище");
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": meta.mimeType,
        "Content-Disposition": contentDispositionForAttachment(meta.originalName, meta.mimeType),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    return handleError(e);
  }
}
