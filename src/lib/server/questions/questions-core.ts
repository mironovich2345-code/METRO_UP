import type { QuestionCategory, QuestionStatus } from "@prisma/client";
import type { ActorContext, RoleGrant } from "../rbac/types";
import { hasSystemAccess, hasNetworkAccess } from "../rbac/authorize-core";
import { grantCoversClub, grantCoversCity, hasActiveRole, isGrantActive } from "../rbac/scope-core";
import type { EmployeeQuestionDTO, QuestionSenderContextDTO } from "@/lib/api/questions-types";

/**
 * METRO UP ROUND 1, Milestone 2A — Employee Questions. Pure (no Prisma/
 * server-only import — directly unit testable) RBAC predicates and DTO
 * sanitization, matching this codebase's established split between pure
 * decision logic (`-core.ts`) and the DB-touching service that calls it
 * (questions-service.ts). This is the ONE place every later list/detail/
 * status-mutation endpoint must route its authorization through — never
 * reimplemented inline at a route handler (section 9).
 */

export const MAX_QUESTION_ATTACHMENTS = 5;

/** The three roles allowed to send a question (section 1). "MANAGER" here
 * is this app's NetworkRole for a plain front-line employee — not a
 * management title — exactly like every other NetworkRole=MANAGER usage in
 * this codebase. Canonically defined in the client-facing questions-types.ts
 * (the single source of truth for this shape); re-exported here under this
 * name since every server-side call site in this domain already uses it. */
export type QuestionSenderContext = QuestionSenderContextDTO;

export function isQuestionSenderContext(value: string): value is QuestionSenderContext {
  return value === "MANAGER" || value === "CLUB_MANAGER" || value === "CITY_MANAGER";
}

/** METRO UP ROUND 1, Milestone 3 — forgiving query-param validation for the
 * list endpoint's optional status/category filters. An unrecognized value is
 * never a 400 (section 3's list API is a GET with freeform query params,
 * matching audit-service.ts's own forgiving-filter convention) — the route
 * treats it as "no filter" (ALL), never passes an unvalidated string into a
 * Prisma `where` clause. */
const QUESTION_STATUS_VALUES: readonly string[] = ["NEW", "IN_PROGRESS", "CLOSED"];
export function isQuestionStatusValue(value: string): value is QuestionStatus {
  return QUESTION_STATUS_VALUES.includes(value);
}

const QUESTION_CATEGORY_VALUES: readonly string[] = [
  "WORK_PROCESSES",
  "TRAINING",
  "MANAGEMENT",
  "WORKING_CONDITIONS",
  "TECHNICAL",
  "IDEA",
  "OTHER",
];
export function isQuestionCategoryValue(value: string): value is QuestionCategory {
  return QUESTION_CATEGORY_VALUES.includes(value);
}

/**
 * METRO UP ROUND 1, Milestone 3, section 8 — which status buttons the
 * detail page should offer: one FORWARD step (the primary action) and,
 * where the domain allows it, one CORRECTION step back. Deliberately NOT a
 * backend enforcement mechanism — updateEmployeeQuestionStatus accepts any
 * of the three statuses from an authorized actor (no FSM there; existing
 * domain rules impose none) — this only decides what the UI presents as a
 * sensible action, never what the server will accept.
 */
export function allowedStatusTransitions(current: QuestionStatus): { forward: QuestionStatus | null; correction: QuestionStatus | null } {
  switch (current) {
    case "NEW":
      return { forward: "IN_PROGRESS", correction: null };
    case "IN_PROGRESS":
      return { forward: "CLOSED", correction: "NEW" };
    case "CLOSED":
      return { forward: null, correction: "IN_PROGRESS" };
    default:
      return { forward: null, correction: null };
  }
}

/**
 * May this actor send a question AS the claimed context? Mirrors
 * resolveActiveContext's validation philosophy (cabinet-ui.ts) applied to a
 * WRITE instead of a read: the claimed context must match authority the
 * actor ACTUALLY currently holds, never trusted at face value. "MANAGER" is
 * always available to anyone who reaches this point (the caller already
 * required an EmployeeProfile via requireActiveAccess) — exactly like Home's
 * context switcher always offers PERSONAL regardless of what ELSE an actor
 * holds.
 */
export function canSendQuestionAs(actor: ActorContext, context: QuestionSenderContext): boolean {
  switch (context) {
    case "MANAGER":
      return true;
    case "CLUB_MANAGER":
      return hasActiveRole(actor.grants, "CLUB_MANAGER") || actor.appRole === "CLUB_MANAGER";
    case "CITY_MANAGER":
      return hasActiveRole(actor.grants, "CITY_MANAGER");
    default:
      return false;
  }
}

/**
 * METRO UP ROUND 1, Milestone 2B.1, section B — one possible answer to
 * "which city/club is this question actually about", for a CLUB_MANAGER or
 * CITY_MANAGER sender who may hold more than one active grant.
 * EmployeeProfile.cityId/clubId is NOT this — it's the author's own
 * employment location, orthogonal to which management scope they're
 * submitting under (a CITY_MANAGER's EmployeeProfile club, if any, might
 * not even be inside any city they manage).
 */
export interface QuestionScopeCandidate {
  cityId: string;
  cityName: string;
  clubId: string | null;
  clubName: string | null;
}

export type ScopeHint = { cityId?: string; clubId?: string } | undefined;

export type ScopeResolutionResult =
  | { ok: true; scope: QuestionScopeCandidate }
  | { ok: false; code: "no_scope" | "ambiguous_scope" | "invalid_scope_hint" };

/**
 * Section B — the ONE decision: given every scope this actor's CURRENT,
 * ACTIVE grants could legitimately mean, and an OPTIONAL client-supplied
 * hint (never trusted as authority by itself — it only SELECTS among
 * candidates this function independently computed from real grants), which
 * one wins?
 *
 *  - zero candidates: "no_scope" (canSendQuestionAs should have already
 *    rejected this before reaching here — defensive, not the expected path).
 *  - a hint that matches exactly one candidate (by clubId first, else
 *    cityId): that candidate — explicit, validated selection, never a raw
 *    client cityId/clubId used directly.
 *  - a hint that matches NO candidate (forged, revoked since the hint was
 *    issued, or a city/club this actor never held): "invalid_scope_hint" —
 *    rejected, never silently falls through to guessing.
 *  - no hint AND exactly one candidate: that candidate auto-resolves — not
 *    "arbitrary-first", the ONLY possible answer given real grants.
 *  - no hint AND 2+ candidates: "ambiguous_scope" — rejected rather than
 *    silently picking candidates[0] (the exact "arbitrary-first" behavior
 *    this section exists to forbid).
 */
export function resolveScopeFromCandidates(candidates: QuestionScopeCandidate[], hint: ScopeHint): ScopeResolutionResult {
  if (candidates.length === 0) return { ok: false, code: "no_scope" };

  if (hint && (hint.clubId || hint.cityId)) {
    const matched = hint.clubId ? candidates.find((c) => c.clubId === hint.clubId) : candidates.find((c) => c.cityId === hint.cityId);
    return matched ? { ok: true, scope: matched } : { ok: false, code: "invalid_scope_hint" };
  }

  if (candidates.length === 1) return { ok: true, scope: candidates[0] };

  return { ok: false, code: "ambiguous_scope" };
}

export function describeScopeResolutionError(code: "no_scope" | "ambiguous_scope" | "invalid_scope_hint"): string {
  switch (code) {
    case "ambiguous_scope":
      return "Не удалось определить контекст для вопроса. Выберите город/клуб в приложении и попробуйте снова.";
    case "invalid_scope_hint":
      return "Недействительный контекст. Обновите приложение и попробуйте снова.";
    case "no_scope":
    default:
      return "Недостаточно прав для отправки вопроса.";
  }
}

/** The subset of an EmployeeQuestion row every scope-based predicate below
 * needs — kept narrow and Prisma-shape-compatible rather than importing a
 * full Prisma payload type into a file that must stay DB-import-free. */
export interface QuestionScope {
  authorUserId: string;
  cityIdSnapshot: string;
  clubIdSnapshot: string | null;
}

/** Section 2/6 — "routing" IS visibility: there is exactly one
 * EmployeeQuestion row; who may read it is derived from role+scope, never a
 * fan-out of duplicate records. A CITY_MANAGER grant covers a question when
 * it covers the question's club snapshot (CLUB-scope grant) or its city
 * snapshot as a whole (CITY-scope grant) — reuses grantCoversClub/
 * grantCoversCity UNCHANGED, the exact same predicates every other
 * CITY_MANAGER scope check in this codebase already uses. */
function cityManagerCanReach(grants: RoleGrant[], q: QuestionScope): boolean {
  return grants.some((g) => {
    if (g.role !== "CITY_MANAGER" || !isGrantActive(g)) return false;
    if (q.clubIdSnapshot) return grantCoversClub(g, q.clubIdSnapshot, q.cityIdSnapshot);
    return grantCoversCity(g, q.cityIdSnapshot);
  });
}

/**
 * Section 6 — read authorization. The author can always read their own
 * submission (not a scope bypass — it's literally their own data);
 * PROJECT_ADMIN/OPERATIONS_DIRECTOR read network-wide; a CITY_MANAGER reads
 * whatever their grants cover. A plain MANAGER/CLUB_MANAGER has no inbox in
 * this round beyond their own questions (listEmployeeQuestionsForActor's
 * fallback — see questions-service.ts).
 */
export function canReadQuestion(actor: ActorContext, q: QuestionScope): boolean {
  if (actor.userId === q.authorUserId) return true;
  if (hasSystemAccess(actor)) return true;
  if (hasNetworkAccess(actor)) return true;
  return cityManagerCanReach(actor.grants, q);
}

/**
 * Section 7 — status mutation authority. Deliberately WITHOUT the
 * self-authorship clause canReadQuestion has: "MANAGER / CLUB_MANAGER may
 * NOT change question status" must hold even for their OWN question. A
 * CITY_MANAGER/OPERATIONS_DIRECTOR/PROJECT_ADMIN who ALSO happens to be the
 * author (e.g. a CITY_MANAGER filing their own question) is still
 * authorized here — correctly, since that authority comes from their
 * management grant, not from self-authorship.
 */
export function canChangeQuestionStatus(actor: ActorContext, q: QuestionScope): boolean {
  if (hasSystemAccess(actor)) return true;
  if (hasNetworkAccess(actor)) return true;
  return cityManagerCanReach(actor.grants, q);
}

/**
 * Section 3 — SECURITY CRITICAL. True when this specific viewer may see the
 * REAL author identity of this question. Non-anonymous questions are always
 * revealed to anyone already authorized to read them at all (canReadQuestion
 * is the gate for "can see this question exists", this decides "with whose
 * name on it"). Anonymous questions reveal only to the author themselves or
 * PROJECT_ADMIN (hasSystemAccess) — CITY_MANAGER and OPERATIONS_DIRECTOR are
 * deliberately excluded even though hasNetworkAccess would include
 * OPERATIONS_DIRECTOR, which is exactly why this checks hasSystemAccess
 * specifically and NOT hasNetworkAccess.
 */
export function shouldRevealAuthor(actor: ActorContext, q: { authorUserId: string; anonymous: boolean }): boolean {
  if (!q.anonymous) return true;
  if (actor.userId === q.authorUserId) return true;
  return hasSystemAccess(actor);
}

/** Client-safe shape — NEVER includes telegramId/username/avatar/phone or
 * any raw storage key (attachments expose only display metadata; retrieval
 * is a separate, re-authorized concern for a later milestone). */
export type { EmployeeQuestionDTO };

const ANONYMOUS_AUTHOR_DISPLAY = "Анонимный сотрудник";

/** The full shape sanitizeQuestionForActor needs — exactly what
 * questions-service.ts's Prisma queries select/include, kept as a plain
 * interface here (not a Prisma payload type) so this function has zero
 * Prisma/DB import and real, direct test coverage. */
export interface QuestionRecordForSanitize {
  id: string;
  category: QuestionCategory;
  text: string;
  anonymous: boolean;
  status: QuestionStatus;
  authorUserId: string;
  authorDisplayName: string;
  senderRole: string;
  cityNameSnapshot: string;
  clubNameSnapshot: string | null;
  createdAt: Date;
  updatedAt: Date;
  attachments: { id: string; originalName: string; mimeType: string; sizeBytes: number }[];
}

/**
 * Section 3/9 — the ONE sanitization function every question-returning
 * endpoint must call. Never performs its own authorization check (the
 * caller must already have confirmed canReadQuestion) — this only decides
 * WHAT is shown once reading is already allowed, via shouldRevealAuthor.
 *
 * METRO UP ROUND 1, Milestone 2A.1 — when hidden, `authorUserId` is spread
 * in CONDITIONALLY so the key is genuinely ABSENT from the returned object
 * (`'authorUserId' in dto` is false), not present with value `null`. A
 * `null`/`undefined`-valued but still-present key survives as an own
 * property (`hasOwnProperty` true) even though JSON.stringify happens to
 * drop `undefined` — omitting the key outright is the only form that is
 * correct under every inspection method (property existence, JSON.stringify
 * substring search, Object.keys), not just the common ones.
 */
export function sanitizeQuestionForActor(actor: ActorContext, record: QuestionRecordForSanitize): EmployeeQuestionDTO {
  const reveal = shouldRevealAuthor(actor, { authorUserId: record.authorUserId, anonymous: record.anonymous });
  return {
    id: record.id,
    category: record.category,
    text: record.text,
    anonymous: record.anonymous,
    status: record.status,
    authorDisplay: reveal ? record.authorDisplayName : ANONYMOUS_AUTHOR_DISPLAY,
    ...(reveal ? { authorUserId: record.authorUserId } : {}),
    senderRole: record.senderRole as QuestionSenderContext,
    cityName: record.cityNameSnapshot,
    clubName: record.clubNameSnapshot,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    attachments: record.attachments.map((a) => ({ id: a.id, originalName: a.originalName, mimeType: a.mimeType, sizeBytes: a.sizeBytes })),
  };
}

/* ------------------------- attachment storage ownership ------------------------- */

export function questionAttachmentKeyPrefix(userId: string): string {
  return `questions/${userId}/`;
}

/** Same ownership-by-namespace-prefix pattern as avatar-core.ts's
 * isOwnAvatarKey — a client can never submit a storage key it wasn't issued,
 * even if it somehow learned another user's key. */
export function isOwnQuestionAttachmentKey(userId: string, storageKey: string): boolean {
  return storageKey.startsWith(questionAttachmentKeyPrefix(userId));
}

const QUESTION_ATTACHMENT_EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

export function extForQuestionAttachmentMime(mimeType: string): string {
  return QUESTION_ATTACHMENT_EXT_BY_MIME[mimeType] ?? "bin";
}

/**
 * METRO UP ROUND 1, Milestone 3, section 7 — the attachment DOWNLOAD PROXY's
 * response header. Deliberately never includes anything storage-related
 * (the caller — the download route — already resolved storageKey server-side
 * only, to fetch bytes; this function never sees it). `originalName` is
 * user-controlled (the uploader's own file name) — stripped of CR/LF (header
 * injection) and given a plain-ASCII fallback alongside an RFC 5987 UTF-8
 * form so Cyrillic file names survive. "inline" for images/PDF so a
 * preview/open action works without forcing a save dialog (section 7's "for
 * image attachments: preview may be shown if practical; for PDF: show a safe
 * download/open action" — inline satisfies both, the browser decides how to
 * render it).
 */
export function contentDispositionForAttachment(originalName: string, mimeType: string): string {
  const disposition = mimeType.startsWith("image/") || mimeType === "application/pdf" ? "inline" : "attachment";
  const stripped = originalName.replace(/[\r\n"]/g, "").trim().slice(0, 150) || "file";
  const asciiFallback = stripped.replace(/[^\x20-\x7E]/g, "_");
  return `${disposition}; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(stripped)}`;
}

/**
 * METRO UP ROUND 1, Milestone 3 — the routing rule's own tier boundary:
 * "MANAGER / CLUB_MANAGER → CITY_MANAGER(s) covering their scope →
 * OPERATIONS_DIRECTOR(s). A CITY_MANAGER's OWN submitted question routes to
 * OPERATIONS_DIRECTOR only." A CITY_MANAGER-tier "employee questions inbox"
 * (listEmployeeQuestionsForActor's CITY_MANAGER branch) must therefore never
 * surface a senderRole=CITY_MANAGER row to ANY CITY_MANAGER — not just the
 * author themselves. Self-authorship alone is the wrong boundary: a second
 * CITY_MANAGER whose scope happens to overlap (e.g. a CITY-wide grant and a
 * peer's CLUB-scoped grant inside the same city) must not see it either — it
 * was never addressed to the CITY_MANAGER tier at all, regardless of who's
 * asking. This is INBOX-recipient semantics, deliberately separate from
 * canReadQuestion's generic "may this actor see this question exists" (which
 * correctly keeps the self-authorship clause for direct detail access).
 */
export const INBOX_EXCLUDED_SENDER_ROLE: QuestionSenderContext = "CITY_MANAGER";
