import "server-only";
import type { AuditAction, Prisma } from "@prisma/client";
import { prisma } from "./db";

/**
 * Minimal content audit trail. Records who did what to which entity. Never logs
 * secrets or PII — only ids, action, and small non-sensitive metadata.
 */
export async function writeAudit(
  client: Prisma.TransactionClient | typeof prisma,
  input: {
    actorUserId: string;
    entityType: string;
    entityId: string;
    action: AuditAction;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await client.contentAuditLog.create({
    data: {
      actorUserId: input.actorUserId,
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      metadata: (input.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}
