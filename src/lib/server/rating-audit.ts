import "server-only";
import type { Prisma, RatingAuditAction } from "@prisma/client";
import { prisma } from "./db";

/**
 * Immutable audit trail for SPM rating actions. Since SPM is the sole author of
 * rating-affecting data, every write is logged (never hard-deleted).
 */
export async function writeRatingAudit(
  client: Prisma.TransactionClient | typeof prisma,
  input: {
    actorUserId: string;
    action: RatingAuditAction;
    entityType: string;
    entityId: string;
    month?: number;
    year?: number;
    before?: unknown;
    after?: unknown;
  },
): Promise<void> {
  await client.ratingAuditLog.create({
    data: {
      actorUserId: input.actorUserId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      month: input.month ?? null,
      year: input.year ?? null,
      before: (input.before ?? undefined) as Prisma.InputJsonValue | undefined,
      after: (input.after ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}
