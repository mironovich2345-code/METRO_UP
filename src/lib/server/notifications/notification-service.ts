import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db";
import {
  buildQuestionNotificationText,
  dedupeQuestionNotificationRecipients,
  QUESTION_ENTITY_TYPE,
  NOTIFICATION_DEEP_LINK_PATH,
  type QuestionNotificationContent,
} from "./notification-core";
import { sendTelegramMessage, buildMiniAppUrl } from "./telegram-bot";

/**
 * METRO UP ROUND 1, Milestone 4 — Notification domain, DB-touching half.
 * Mirrors this codebase's established split: notification-core.ts (pure
 * text/classification) and telegram-bot.ts (pure network I/O, no Prisma)
 * are both imported here, never duplicated.
 */

/* ============================== recipient resolution ============================== */

/** The subset of an EmployeeQuestion row recipient resolution needs. */
export interface QuestionNotificationSource {
  id: string;
  authorUserId: string;
  senderRole: string;
  cityIdSnapshot: string;
  clubIdSnapshot: string | null;
}

/**
 * Section 2 — server-side, from LIVE RoleAssignments, inside the SAME
 * transaction the question itself is created in (never a stale/cached
 * grant set). Routing rule: MANAGER/CLUB_MANAGER -> covering CITY_MANAGER(s)
 * + all active OPERATIONS_DIRECTOR(s); CITY_MANAGER -> OPERATIONS_DIRECTOR(s)
 * only (their own question never goes to a CITY_MANAGER tier — the exact
 * same routing boundary Milestone 3's INBOX_EXCLUDED_SENDER_ROLE encodes
 * for reads). Deduplicated by userId (a Set) — a user holding BOTH
 * CITY_MANAGER and OPERATIONS_DIRECTOR grants ends up in the set once. The
 * author is always excluded, defensively, even though the routing rule
 * itself should never route a question back to its own author.
 *
 * Exactly TWO queries regardless of how many CITY_MANAGER/OPERATIONS_
 * DIRECTOR rows exist (section 15 — "no N+1"): one for the covering
 * CITY_MANAGER grants (skipped entirely for a CITY_MANAGER-authored
 * question, since it has no CITY_MANAGER-tier recipient at all), one for
 * every active OPERATIONS_DIRECTOR grant. Both use the existing
 * `[role, scopeType, cityId/clubId, status]` RoleAssignment indexes.
 */
export async function resolveQuestionNotificationRecipients(
  tx: Prisma.TransactionClient,
  question: QuestionNotificationSource,
): Promise<string[]> {
  let cityManagerUserIds: string[] = [];
  if (question.senderRole !== "CITY_MANAGER") {
    const cityManagerGrants = await tx.roleAssignment.findMany({
      where: {
        role: "CITY_MANAGER",
        status: "ACTIVE",
        OR: [
          { scopeType: "CITY", cityId: question.cityIdSnapshot },
          ...(question.clubIdSnapshot ? [{ scopeType: "CLUB" as const, clubId: question.clubIdSnapshot }] : []),
        ],
      },
      select: { userId: true },
    });
    cityManagerUserIds = cityManagerGrants.map((g) => g.userId);
  }

  const operationsDirectorGrants = await tx.roleAssignment.findMany({
    where: { role: "OPERATIONS_DIRECTOR", status: "ACTIVE" },
    select: { userId: true },
  });
  const operationsDirectorUserIds = operationsDirectorGrants.map((g) => g.userId);

  return dedupeQuestionNotificationRecipients(cityManagerUserIds, operationsDirectorUserIds, question.authorUserId);
}

export interface QuestionNotificationResult {
  notificationId: string;
  recipientUserIds: string[];
}

/**
 * Section 1/3 — the durable half. Runs INSIDE the caller's own question-
 * creation transaction (questions-service.ts's createEmployeeQuestion) so
 * the Notification + NotificationRecipient rows are committed atomically
 * with the question itself — they exist regardless of what Telegram does
 * next. ONE Notification row + ONE bulk createMany (never a per-recipient
 * insert — section 15). Returns `null` (not an empty-recipients object) when
 * there is genuinely no one to notify yet (e.g. a fresh deployment with no
 * OPERATIONS_DIRECTOR assigned) — the caller skips delivery entirely rather
 * than creating an orphan zero-recipient Notification row.
 */
export async function createQuestionNotification(
  tx: Prisma.TransactionClient,
  question: QuestionNotificationSource,
): Promise<QuestionNotificationResult | null> {
  const recipientUserIds = await resolveQuestionNotificationRecipients(tx, question);
  if (recipientUserIds.length === 0) return null;

  const notification = await tx.notification.create({
    data: { type: "EMPLOYEE_QUESTION_CREATED", entityType: QUESTION_ENTITY_TYPE, entityId: question.id },
  });
  await tx.notificationRecipient.createMany({
    data: recipientUserIds.map((userId) => ({ notificationId: notification.id, userId })),
  });
  return { notificationId: notification.id, recipientUserIds };
}

/* ============================== telegram delivery ============================== */

/** The subset of the created EmployeeQuestion row the Telegram message
 * builder needs — matches QUESTION_INCLUDE's shape (questions-service.ts),
 * so the caller passes the SAME row it already has, no extra query. */
export interface QuestionNotificationQuestion {
  senderRole: string;
  anonymous: boolean;
  category: QuestionNotificationContent["category"];
  cityNameSnapshot: string;
  clubNameSnapshot: string | null;
  author: { displayName: string };
}

/**
 * Section 1/3/7 — the SEPARATE delivery step, called by the caller AFTER
 * its transaction has committed (never inside it — a slow/hanging Telegram
 * call must never hold a DB transaction open). AWAITED by the caller, never
 * fire-and-forget (section 3's explicit "avoid unsafe fire-and-forget
 * promises that can disappear when the request ends") — but this function
 * itself NEVER throws, so awaiting it can never fail question creation.
 * Every recipient is attempted in PARALLEL (section 15 — bounded fan-out,
 * total added latency ~one timeout period, not one per recipient) and gets
 * its own independent delivery-status update; one recipient's failure never
 * affects another's.
 */
export async function deliverQuestionNotificationsTelegram(
  question: QuestionNotificationQuestion,
  notificationResult: QuestionNotificationResult | null,
): Promise<void> {
  if (!notificationResult || notificationResult.recipientUserIds.length === 0) return;
  try {
    const users = await prisma.user.findMany({
      where: { id: { in: notificationResult.recipientUserIds } },
      select: { id: true, telegramId: true },
    });

    const text = buildQuestionNotificationText({
      senderRole: question.senderRole as QuestionNotificationContent["senderRole"],
      anonymous: question.anonymous,
      // Section 4 — never pass the real name through when anonymous, even
      // though buildQuestionNotificationText independently re-checks this.
      authorDisplayName: question.anonymous ? null : question.author.displayName,
      category: question.category,
      cityName: question.cityNameSnapshot,
      clubName: question.clubNameSnapshot,
    });
    const webAppUrl = buildMiniAppUrl(NOTIFICATION_DEEP_LINK_PATH);

    await Promise.all(
      users.map(async (u) => {
        // Section 12 — "if user has no usable Telegram identity: in-app
        // notification still exists; Telegram status records unavailable/
        // skipped appropriately. This must not be treated as question
        // failure." User.telegramId is NOT NULL in this schema today (every
        // account originates from Telegram), so this branch is currently
        // unreachable in practice — handled anyway, defensively, for the
        // case this ever changes (and it is independently unit-tested).
        const result = u.telegramId ? await sendTelegramMessage(u.telegramId, text, webAppUrl) : ({ status: "SKIPPED", code: "no_identity" } as const);
        await prisma.notificationRecipient
          .updateMany({
            where: { notificationId: notificationResult.notificationId, userId: u.id },
            data: {
              telegramStatus: result.status,
              telegramSentAt: result.status === "SENT" ? new Date() : null,
              telegramErrorCode: result.status === "SENT" ? null : result.code,
              deliveryAttempts: { increment: 1 },
            },
          })
          .catch(() => {
            // A bookkeeping write failing must never surface — the message
            // was already sent or not; this only affects future UI display.
          });
      }),
    );
  } catch {
    // Backstop (section 3) — recipient/user lookup or text-building should
    // never throw, but Telegram delivery as a whole must NEVER fail
    // question creation regardless of what goes wrong here.
  }
}

/* ============================== read state ============================== */

/**
 * Section 9/11 — called when a recipient opens the question's detail (see
 * questions-service.ts's getEmployeeQuestionForActor). Self-scoped by
 * construction: `userId` is always the CALLER's own session-derived id
 * (never a client-supplied target), so this can only ever mark the CALLING
 * actor's own NotificationRecipient rows read (section 11/14's "a user can
 * read/update ONLY their own rows" — there is no code path that accepts a
 * different value here). A non-recipient (e.g. the author, or a plain
 * MANAGER) matches zero rows — a harmless no-op, not an error. Never
 * touches EmployeeQuestion.status (section 9 — "opening ≠ IN_PROGRESS").
 */
export async function markQuestionNotificationRead(userId: string, questionId: string): Promise<void> {
  try {
    await prisma.notificationRecipient.updateMany({
      where: { userId, readAt: null, notification: { entityType: QUESTION_ENTITY_TYPE, entityId: questionId } },
      data: { readAt: new Date() },
    });
  } catch {
    // Best-effort — reading a question must never fail because marking a
    // notification read failed.
  }
}

/**
 * Section 9/11 — Home's unread badge. `userId` is always the caller's own
 * id (same self-scoping guarantee as markQuestionNotificationRead above).
 * Deliberately NOT re-validated against the actor's CURRENT live scope —
 * unlike Milestone 3's "N новых" business count, this is a delivery/read
 * record: a recipient who later loses their grant still correctly sees that
 * they have an unread alert they haven't opened yet.
 */
export async function getUnreadQuestionNotificationCount(userId: string): Promise<number> {
  return prisma.notificationRecipient.count({
    where: { userId, readAt: null, notification: { type: "EMPLOYEE_QUESTION_CREATED" } },
  });
}
