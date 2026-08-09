import "server-only";
import { prisma } from "./db";
import { AuthError } from "./authz";
import { getPeriod, isPublishablePeriod } from "./period";
import { writeRatingAudit } from "./rating-audit";
import { evaluateRatingAchievements } from "./rating-achievements";

/**
 * Publish / reopen a rating period. Publication is transactional and idempotent
 * (double-click safe): the status is re-checked inside the transaction, so a
 * second publish returns the already-published period without duplicating rows.
 *
 * Reopen (PUBLISHED → DRAFT) is the V1 correction path. No snapshot versioning:
 * reopening hides the published rating from employees until it is re-published
 * (documented trade-off).
 */
export async function publishRating(month: number, year: number, actorUserId: string) {
  const period = await getPeriod(month, year);
  if (!period) throw new AuthError(404, "period_not_found");
  if (!isPublishablePeriod(month, year))
    throw new AuthError(409, "period_not_completed", "Нельзя публиковать незавершённый месяц");
  if (period.status === "PUBLISHED") return period; // idempotent
  if (period.status !== "READY")
    throw new AuthError(409, "not_ready", "Сначала рассчитайте рейтинг");

  const updated = await prisma.$transaction(async (tx) => {
    const cur = await tx.ratingPeriod.findUnique({ where: { id: period.id } });
    if (!cur) throw new AuthError(404, "period_not_found");
    if (cur.status === "PUBLISHED") return cur; // concurrency: someone published first
    if (cur.status !== "READY") throw new AuthError(409, "not_ready");

    await tx.monthlyRating.updateMany({
      where: { month, year, status: "DRAFT" },
      data: { status: "PUBLISHED", publishedAt: new Date() },
    });
    const p = await tx.ratingPeriod.update({
      where: { id: period.id },
      data: { status: "PUBLISHED", publishedAt: new Date(), publishedByUserId: actorUserId },
    });
    await writeRatingAudit(tx, {
      actorUserId, action: "RATING_PUBLISH", entityType: "RatingPeriod", entityId: p.id, month, year,
    });
    return p;
  });

  // Idempotent achievement evaluation once the rating is live.
  await evaluateRatingAchievements(month, year);
  return updated;
}

export async function reopenRating(month: number, year: number, actorUserId: string) {
  const period = await getPeriod(month, year);
  if (!period) throw new AuthError(404, "period_not_found");
  if (period.status !== "PUBLISHED")
    throw new AuthError(409, "not_published", "Период не опубликован");

  return prisma.$transaction(async (tx) => {
    await tx.monthlyRating.updateMany({
      where: { month, year, status: "PUBLISHED" },
      data: { status: "DRAFT", publishedAt: null },
    });
    const p = await tx.ratingPeriod.update({
      where: { id: period.id },
      data: { status: "DRAFT", publishedAt: null, publishedByUserId: null },
    });
    await writeRatingAudit(tx, {
      actorUserId, action: "RATING_REOPEN", entityType: "RatingPeriod", entityId: p.id, month, year,
    });
    return p;
  });
}
