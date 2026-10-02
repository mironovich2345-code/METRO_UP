import "server-only";
import { randomUUID } from "node:crypto";
import type { QuestionCategory, QuestionStatus } from "@prisma/client";
import { prisma } from "../db";
import { AuthError } from "../authz";
import { writeAudit } from "../audit";
import { getStorageProvider } from "@/lib/storage/provider";
import { validateUpload } from "@/lib/storage/validation";
import { getCityById, getClubById } from "@/content/cities";
import type { CurrentUser } from "../session";
import type { ActorContext } from "../rbac/types";
import { hasSystemAccess, hasNetworkAccess } from "../rbac/authorize-core";
import { isGrantActive } from "../rbac/scope-core";
import { cityIdForClub, resolveClubManagerClubs } from "../rbac/context";
import {
  MAX_QUESTION_ATTACHMENTS,
  canChangeQuestionStatus,
  canReadQuestion,
  canSendQuestionAs,
  describeScopeResolutionError,
  extForQuestionAttachmentMime,
  isOwnQuestionAttachmentKey,
  questionAttachmentKeyPrefix,
  resolveScopeFromCandidates,
  sanitizeQuestionForActor,
  type EmployeeQuestionDTO,
  type QuestionScopeCandidate,
  type QuestionSenderContext,
  type ScopeHint,
} from "./questions-core";

/**
 * METRO UP ROUND 1, Milestone 2A — Employee Questions service layer. Every
 * function here is what a LATER route handler calls — no route in this
 * milestone (or any later one) should query `prisma.employeeQuestion`
 * directly (section 9). RBAC decisions are never re-derived here; they
 * delegate entirely to questions-core.ts's pure predicates.
 *
 * NOTIFICATIONS (section 10): deliberately NOT wired here. Milestone 4 adds
 * delivery by calling these same functions' RETURN VALUES (the created
 * question / the old+new status) from the route layer or a thin wrapper —
 * nothing below needs to change shape for that, and no side-effect hook is
 * baked into persistence itself.
 */

const QUESTION_INCLUDE = {
  attachments: { select: { id: true, originalName: true, mimeType: true, sizeBytes: true } },
  author: { select: { displayName: true } },
} as const;

/** Narrows a Prisma question+relations row into questions-core.ts's
 * DB-import-free sanitize input shape. */
function toSanitizeInput(row: {
  id: string;
  category: QuestionCategory;
  text: string;
  anonymous: boolean;
  status: QuestionStatus;
  authorUserId: string;
  senderRole: string;
  cityNameSnapshot: string;
  clubNameSnapshot: string | null;
  createdAt: Date;
  updatedAt: Date;
  author: { displayName: string };
  attachments: { id: string; originalName: string; mimeType: string; sizeBytes: number }[];
}) {
  return {
    id: row.id,
    category: row.category,
    text: row.text,
    anonymous: row.anonymous,
    status: row.status,
    authorUserId: row.authorUserId,
    authorDisplayName: row.author.displayName,
    senderRole: row.senderRole,
    cityNameSnapshot: row.cityNameSnapshot,
    clubNameSnapshot: row.clubNameSnapshot,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    attachments: row.attachments,
  };
}

/* ============================== attachments ============================== */

export interface AttachmentUploadTicket {
  uploadUrl: string;
  storageKey: string;
  requiredHeaders: Record<string, string>;
  expiresInSeconds: number;
}

/** Step 1 of the signed-upload-then-verify flow (same pattern as avatar.ts/
 * media.ts) — issues a ticket under the CALLER's own namespace. The actual
 * verification (ownership + real mime/size via headObject) happens at
 * question-creation time, in ONE pass over every attachment the caller
 * submits — there is no separate per-file "complete" step, since an
 * attachment has nothing to commit to until the question it belongs to
 * actually exists. */
export async function requestQuestionAttachmentUpload(
  userId: string,
  input: { contentType: string; sizeBytes: number },
): Promise<AttachmentUploadTicket> {
  const check = validateUpload("QUESTION_ATTACHMENT", input.contentType, input.sizeBytes);
  if (!check.ok) throw new AuthError(400, check.code, check.message);

  const storageKey = `${questionAttachmentKeyPrefix(userId)}${randomUUID()}.${extForQuestionAttachmentMime(input.contentType)}`;
  const storage = getStorageProvider();
  const signed = await storage.createSignedUploadUrl({ storageKey, contentType: input.contentType });

  return {
    uploadUrl: signed.uploadUrl,
    storageKey,
    requiredHeaders: signed.requiredHeaders,
    expiresInSeconds: signed.expiresInSeconds,
  };
}

/* ================================ creation ================================ */

export interface CreateQuestionInput {
  senderContext: QuestionSenderContext;
  category: QuestionCategory;
  text: string;
  anonymous: boolean;
  attachments: { storageKey: string; originalName: string }[];
  /** METRO UP ROUND 1, Milestone 2B.1, section B — an OPTIONAL hint for
   * which scope to submit under when the actor holds more than one. Never
   * trusted by itself — resolveScopeFromCandidates only lets it SELECT
   * among candidates independently derived from the actor's real, active
   * grants (buildClubManagerScopeCandidates/buildCityManagerScopeCandidates
   * below). A forged value matches nothing and is rejected. */
  scopeHint?: ScopeHint;
}

/** Section B — every club this CLUB_MANAGER could legitimately be
 * submitting under, reusing resolveClubManagerClubs UNCHANGED (the exact
 * same dynamic resolution /team and Home's own CLUB_MANAGER context already
 * rely on — both the legacy EmployeeProfile.clubId axis and any explicit
 * CLUB-scoped RoleAssignment). */
async function buildClubManagerScopeCandidates(user: CurrentUser, actor: ActorContext): Promise<QuestionScopeCandidate[]> {
  const clubs = await resolveClubManagerClubs(user, actor);
  return clubs.map((c) => ({ cityId: c.cityId, cityName: c.cityName ?? c.cityId, clubId: c.id, clubName: c.name }));
}

/** Section B — every scope a CITY_MANAGER's own ACTIVE grants cover: a
 * CITY-scoped grant contributes that whole city (clubId null — mirrors
 * EmployeeQuestion.clubIdSnapshot's own nullability for exactly this case);
 * a CLUB-scoped grant contributes that one club, with its city resolved via
 * cityIdForClub (the same DB helper rbac/context.ts already exposes for
 * this exact "what city is this club in" question elsewhere). */
async function buildCityManagerScopeCandidates(actor: ActorContext): Promise<QuestionScopeCandidate[]> {
  const grants = actor.grants.filter((g) => g.role === "CITY_MANAGER" && isGrantActive(g));
  const candidates: QuestionScopeCandidate[] = [];
  for (const g of grants) {
    if (g.scopeType === "CITY" && g.cityId) {
      candidates.push({ cityId: g.cityId, cityName: getCityById(g.cityId)?.name ?? g.cityId, clubId: null, clubName: null });
    } else if (g.scopeType === "CLUB" && g.clubId) {
      const cityId = await cityIdForClub(g.clubId);
      if (cityId) {
        candidates.push({ cityId, cityName: getCityById(cityId)?.name ?? cityId, clubId: g.clubId, clubName: getClubById(g.clubId)?.name ?? g.clubId });
      }
    }
  }
  return candidates;
}

/**
 * Section 1/4/5 — create the one source-of-truth row. Every input that
 * matters for scope/identity is SERVER-DERIVED: city/club snapshots come
 * from the actor's own EmployeeProfile (never a client-supplied cityId/
 * clubId — section 5's explicit anti-spoofing requirement), and every
 * attachment's storage key is independently re-verified against this exact
 * actor's own namespace and the storage provider's REAL reported mime/size
 * (never the client's original declared values) before anything is
 * committed. The whole submission is rejected if ANY attachment fails
 * verification — never a partially-attached question.
 */
export async function createEmployeeQuestion(user: CurrentUser, actor: ActorContext, input: CreateQuestionInput): Promise<EmployeeQuestionDTO> {
  if (!user.employeeProfile) {
    throw new AuthError(409, "onboarding_required", "Профиль сотрудника не найден");
  }
  if (!canSendQuestionAs(actor, input.senderContext)) {
    throw new AuthError(403, "forbidden", "Недостаточно прав для отправки вопроса в этом качестве");
  }
  const text = input.text.trim();
  if (!text) {
    throw new AuthError(400, "text_required", "Введите текст вопроса");
  }
  if (input.attachments.length > MAX_QUESTION_ATTACHMENTS) {
    throw new AuthError(400, "too_many_attachments", `Максимум ${MAX_QUESTION_ATTACHMENTS} вложений`);
  }

  /**
   * METRO UP ROUND 1, Milestone 2B.1, section B — scope resolution now
   * branches by sender context. MANAGER's scope IS their EmployeeProfile
   * (unchanged — a plain employee has no separate "management scope"
   * concept at all). CLUB_MANAGER/CITY_MANAGER may hold more than one
   * active grant, so EmployeeProfile is never used for them: every
   * candidate scope is derived from their REAL, current grants, and an
   * optional client hint only SELECTS among those candidates (never
   * supplies a raw cityId/clubId directly) — resolveScopeFromCandidates
   * auto-resolves when there is exactly one candidate, requires a matching
   * hint when there are several, and rejects outright rather than ever
   * guessing "the first one".
   */
  let cityId: string;
  let cityName: string;
  let clubId: string | null;
  let clubName: string | null;

  if (input.senderContext === "MANAGER") {
    cityId = user.employeeProfile.cityId;
    clubId = user.employeeProfile.clubId;
    cityName = getCityById(cityId)?.name ?? cityId;
    clubName = getClubById(clubId)?.name ?? clubId;
  } else {
    const candidates =
      input.senderContext === "CLUB_MANAGER" ? await buildClubManagerScopeCandidates(user, actor) : await buildCityManagerScopeCandidates(actor);
    const resolved = resolveScopeFromCandidates(candidates, input.scopeHint);
    if (!resolved.ok) {
      throw new AuthError(409, resolved.code, describeScopeResolutionError(resolved.code));
    }
    cityId = resolved.scope.cityId;
    cityName = resolved.scope.cityName;
    clubId = resolved.scope.clubId;
    clubName = resolved.scope.clubName;
  }

  // Verify every attachment BEFORE the transaction — headObject is a network
  // call to storage, never done while holding a DB transaction open
  // (section 13's spirit: no slow work inside a DB round trip).
  const storage = getStorageProvider();
  const verifiedAttachments: { storageKey: string; originalName: string; mimeType: string; sizeBytes: number }[] = [];
  for (const att of input.attachments) {
    if (!isOwnQuestionAttachmentKey(user.id, att.storageKey)) {
      throw new AuthError(403, "forbidden", "Недостаточно прав для этого вложения");
    }
    const head = await storage.headObject(att.storageKey);
    if (!head.exists) {
      throw new AuthError(409, "attachment_not_found", "Файл не найден в хранилище");
    }
    const recheck = validateUpload("QUESTION_ATTACHMENT", head.mimeType ?? "", head.sizeBytes ?? 0);
    if (!recheck.ok) {
      throw new AuthError(400, recheck.code, recheck.message);
    }
    verifiedAttachments.push({
      storageKey: att.storageKey,
      originalName: att.originalName.slice(0, 300),
      mimeType: head.mimeType!,
      sizeBytes: head.sizeBytes!,
    });
  }

  const created = await prisma.$transaction(async (tx) => {
    const question = await tx.employeeQuestion.create({
      data: {
        authorUserId: user.id,
        senderRole: input.senderContext,
        category: input.category,
        text,
        anonymous: input.anonymous,
        cityIdSnapshot: cityId,
        cityNameSnapshot: cityName,
        clubIdSnapshot: clubId,
        clubNameSnapshot: clubName,
        attachments: verifiedAttachments.length ? { createMany: { data: verifiedAttachments } } : undefined,
      },
      include: QUESTION_INCLUDE,
    });
    await writeAudit(tx, {
      actorUserId: user.id,
      entityType: "EmployeeQuestion",
      entityId: question.id,
      action: "QUESTION_CREATED",
      // Never the question text itself — category/anonymity/sender-role/
      // attachment count only, same non-PII discipline as every other audit
      // write in this codebase.
      metadata: { category: input.category, anonymous: input.anonymous, senderRole: input.senderContext, attachmentCount: verifiedAttachments.length },
    });
    return question;
  });

  return sanitizeQuestionForActor(actor, toSanitizeInput(created));
}

/* ================================= reads ================================= */

/** Section 6 — single-question read, authorized then sanitized. Throws 404
 * for a genuinely missing id and 403 for an existing-but-unauthorized read —
 * matching this codebase's established convention (e.g. /team, /city/club)
 * rather than a stricter anti-enumeration 404-for-both posture this app
 * doesn't use elsewhere. */
export async function getEmployeeQuestionForActor(actor: ActorContext, questionId: string): Promise<EmployeeQuestionDTO> {
  const question = await prisma.employeeQuestion.findUnique({ where: { id: questionId }, include: QUESTION_INCLUDE });
  if (!question) throw new AuthError(404, "question_not_found", "Вопрос не найден");
  if (!canReadQuestion(actor, { authorUserId: question.authorUserId, cityIdSnapshot: question.cityIdSnapshot, clubIdSnapshot: question.clubIdSnapshot })) {
    throw new AuthError(403, "forbidden", "Недостаточно прав для просмотра этого вопроса");
  }
  return sanitizeQuestionForActor(actor, toSanitizeInput(question));
}

export interface ListQuestionsFilter {
  status?: QuestionStatus;
  category?: QuestionCategory;
  cityId?: string;
  clubId?: string;
}

/**
 * Section 6/9/13 — the ONE list function every later inbox endpoint
 * (CITY_MANAGER/OPERATIONS_DIRECTOR/PROJECT_ADMIN, and a possible future
 * "My Questions") calls. ONE Prisma query regardless of how many CITY_MANAGER
 * grants the actor holds (no per-grant round trip) — builds a single OR
 * across every covering city/club, matching section 13's "no N+1" rule.
 * Sanitization happens over the already-loaded rows in memory, never a
 * per-row re-query.
 */
export async function listEmployeeQuestionsForActor(actor: ActorContext, filter: ListQuestionsFilter = {}): Promise<EmployeeQuestionDTO[]> {
  const baseWhere = {
    status: filter.status,
    category: filter.category,
    cityIdSnapshot: filter.cityId,
    clubIdSnapshot: filter.clubId,
  };

  if (hasSystemAccess(actor) || hasNetworkAccess(actor)) {
    const rows = await prisma.employeeQuestion.findMany({ where: baseWhere, include: QUESTION_INCLUDE, orderBy: { createdAt: "desc" } });
    return rows.map((r) => sanitizeQuestionForActor(actor, toSanitizeInput(r)));
  }

  const cityManagerGrants = actor.grants.filter((g) => g.role === "CITY_MANAGER" && isGrantActive(g));
  const cityScopedCities = cityManagerGrants.filter((g) => g.scopeType === "CITY" && g.cityId).map((g) => g.cityId!);
  const clubScopedClubs = cityManagerGrants.filter((g) => g.scopeType === "CLUB" && g.clubId).map((g) => g.clubId!);

  const scopeOr = [
    ...(cityScopedCities.length ? [{ cityIdSnapshot: { in: cityScopedCities } }] : []),
    ...(clubScopedClubs.length ? [{ clubIdSnapshot: { in: clubScopedClubs } }] : []),
  ];

  if (scopeOr.length === 0) {
    // No CITY_MANAGER authority at all — fall back to "my own questions"
    // (section 9's own framing: this function is also what a future
    // self-service "My Questions" view would call, not an inbox-only path).
    const rows = await prisma.employeeQuestion.findMany({
      where: { ...baseWhere, authorUserId: actor.userId },
      include: QUESTION_INCLUDE,
      orderBy: { createdAt: "desc" },
    });
    return rows.map((r) => sanitizeQuestionForActor(actor, toSanitizeInput(r)));
  }

  const rows = await prisma.employeeQuestion.findMany({
    where: { AND: [baseWhere, { OR: scopeOr }] },
    include: QUESTION_INCLUDE,
    orderBy: { createdAt: "desc" },
  });
  return rows.map((r) => sanitizeQuestionForActor(actor, toSanitizeInput(r)));
}

/* ============================== status mutation ============================== */

/** Section 7/8 — status transition, authorized then audited. A no-op
 * transition (already in the requested status) is idempotent and does NOT
 * write a redundant audit row. */
export async function updateEmployeeQuestionStatus(actor: ActorContext, questionId: string, newStatus: QuestionStatus): Promise<EmployeeQuestionDTO> {
  const question = await prisma.employeeQuestion.findUnique({ where: { id: questionId }, include: QUESTION_INCLUDE });
  if (!question) throw new AuthError(404, "question_not_found", "Вопрос не найден");
  if (!canChangeQuestionStatus(actor, { authorUserId: question.authorUserId, cityIdSnapshot: question.cityIdSnapshot, clubIdSnapshot: question.clubIdSnapshot })) {
    throw new AuthError(403, "forbidden", "Недостаточно прав для изменения статуса");
  }

  if (question.status === newStatus) {
    return sanitizeQuestionForActor(actor, toSanitizeInput(question));
  }

  const oldStatus = question.status;
  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.employeeQuestion.update({ where: { id: questionId }, data: { status: newStatus }, include: QUESTION_INCLUDE });
    await writeAudit(tx, {
      actorUserId: actor.userId,
      entityType: "EmployeeQuestion",
      entityId: questionId,
      action: "QUESTION_STATUS_CHANGED",
      metadata: { oldStatus, newStatus },
    });
    return row;
  });

  return sanitizeQuestionForActor(actor, toSanitizeInput(updated));
}
