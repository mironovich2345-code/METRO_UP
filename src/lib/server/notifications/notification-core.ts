import type { QuestionCategory } from "@prisma/client";
import type { QuestionSenderContext } from "../questions/questions-core";

/**
 * METRO UP ROUND 1, Milestone 4 — pure (no Prisma/server-only/network
 * import — directly unit testable) notification content. This is the ONE
 * place the Telegram message text for an employee-question notification is
 * built, matching this codebase's established split between pure decision
 * logic (`-core.ts`) and the DB/network-touching service that calls it
 * (notification-service.ts, telegram-bot.ts).
 *
 * SECTION 4, CRITICAL — anonymity. `authorDisplayName` is typed
 * `string | null`: the CALLER must pass `null` when `anonymous` is true,
 * and this function independently refuses to use the name unless
 * `anonymous === false` regardless of what was passed — the same
 * defense-in-depth posture Milestone 2A.1's sanitizeQuestionForActor
 * established (never trust a single check to prevent an identity leak).
 */

export const QUESTION_ENTITY_TYPE = "EmployeeQuestion";

/** Server-side duplicate of ask-question-core.ts's QUESTION_CATEGORY_OPTIONS
 * labels — that module is client-only (`src/lib/client/`), so it cannot be
 * imported from here without crossing the client/server boundary for a
 * seven-entry label map. Keep in sync if the category set ever changes
 * (same acceptable duplication already used for the MIME/size constants). */
const QUESTION_CATEGORY_LABELS: Record<QuestionCategory, string> = {
  WORK_PROCESSES: "Работа и процессы",
  TRAINING: "Обучение",
  MANAGEMENT: "Руководитель",
  WORKING_CONDITIONS: "Условия работы",
  TECHNICAL: "Техническая проблема",
  IDEA: "Идея / предложение",
  OTHER: "Другое",
};

export interface QuestionNotificationContent {
  /** Which "hat" the AUTHOR was wearing — decides which message shape
   * applies (section 5): MANAGER/CLUB_MANAGER get the "вопрос сотрудника"
   * shape (read by covering CITY_MANAGER(s) AND OPERATIONS_DIRECTOR);
   * CITY_MANAGER gets the distinct "вопрос от Ст. города" shape (read by
   * OPERATIONS_DIRECTOR only). Never the RECIPIENT's own role — the shape is
   * the same regardless of which tier is receiving it. */
  senderRole: QuestionSenderContext;
  anonymous: boolean;
  authorDisplayName: string | null;
  category: QuestionCategory;
  cityName: string;
  clubName: string | null;
}

/**
 * Section 5 — the exact suggested message shapes. Never includes the
 * question's full text (section 5's explicit "reduces privacy leakage in
 * lock-screen notifications" instruction) — category + location only.
 * `location` is the club name when the question has one, else the city
 * name — a single token, matching the task's own examples ("Полтавская",
 * never "Полтавская, Екатеринбург").
 */
export function buildQuestionNotificationText(content: QuestionNotificationContent): string {
  const location = content.clubName ?? content.cityName;
  const categoryLabel = QUESTION_CATEGORY_LABELS[content.category];
  const revealedName = content.anonymous ? null : content.authorDisplayName;

  const header =
    content.senderRole === "CITY_MANAGER"
      ? content.anonymous
        ? "Новый анонимный вопрос от Ст. города"
        : "Новый вопрос от Ст. города"
      : content.anonymous
        ? "Новый анонимный вопрос сотрудника"
        : "Новый вопрос сотрудника";

  const lines = [header, "", ...(revealedName ? [revealedName] : []), `${location} · ${categoryLabel}`, "", "Открыть в Metro UP"];
  return lines.join("\n");
}

/**
 * Section 7 — classify a non-2xx Telegram API response into a SAFE,
 * internal, bounded code — never the raw response body (section 14). 403 is
 * Telegram's own "bot was blocked by the user" signal; 429 is rate-limiting;
 * everything else is a generic API error, still safe to store.
 */
export function classifyTelegramHttpStatus(status: number): string {
  if (status === 403) return "blocked";
  if (status === 400) return "bad_request";
  if (status === 429) return "rate_limited";
  return "api_error";
}

/** The Mini App path a question notification's deep link points at —
 * section 6's explicit fallback ("otherwise link to the Mini App/Questions
 * area") rather than a per-question sub-path this app's cold-start/auth
 * flow has not been verified to handle safely yet. */
export const NOTIFICATION_DEEP_LINK_PATH = "/questions";

/**
 * Section 2/13 — the pure "which users end up as recipients" decision,
 * pulled out of notification-service.ts's DB-touching
 * resolveQuestionNotificationRecipients so the dedup/exclusion rule itself
 * is directly unit-testable without Postgres: the service's job is only to
 * fetch two already-filtered userId lists (covering CITY_MANAGER grants,
 * active OPERATIONS_DIRECTOR grants) and hand them here. A Set naturally
 * collapses a user appearing in both lists (section 2/13's "one person
 * holding both CITY_MANAGER and OPERATIONS_DIRECTOR -> one recipient, not
 * two") to exactly one entry; the author is removed last, defensively, even
 * though the routing rule itself should never route a question back to its
 * own author.
 */
export function dedupeQuestionNotificationRecipients(cityManagerUserIds: string[], operationsDirectorUserIds: string[], authorUserId: string): string[] {
  const ids = new Set<string>([...cityManagerUserIds, ...operationsDirectorUserIds]);
  ids.delete(authorUserId);
  return Array.from(ids);
}
