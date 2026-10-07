import "server-only";
import { prisma } from "../db";
import { getPositionById } from "@/content/positions";
import { getClubById, getCityById } from "@/content/cities";
import { ruMonthYear } from "@/lib/labels";
import { avatarUrlForKey } from "../avatar";
import { getEmployeeTrainingDetail } from "../academy";
import { aggregateQuizAttempts } from "./employee-card-core";
import type {
  ManagementEmployeeCardDTO,
  ManagementEmployeeMysteryResultDTO,
  ManagementEmployeeTestSummaryDTO,
} from "@/lib/api/cabinet-types";

/**
 * Management Round E1 — the ONE shared management Employee Card read model.
 * CLUB_MANAGER and CITY_MANAGER (and, later, OPERATIONS_DIRECTOR) all get
 * the EXACT same shape; authorization (who may request which targetUserId
 * at all) lives entirely in the caller (employee-training/route.ts, the one
 * existing authorized endpoint this composes behind) — this function never
 * re-derives or re-checks scope itself, same separation cabinet-dashboards.ts's
 * own getClubManagerDashboard/getClubManagerTeam already use.
 *
 * Performance (section 12) — five independent reads, run in parallel via
 * Promise.all, each bounded by THIS ONE employee's own row count (never by
 * club/network size): the target's own profile row, the existing
 * getEmployeeTrainingDetail (itself already a small bounded set of
 * queries — unchanged, reused wholesale, never re-implemented here), one
 * QuizAttempt query across every quiz this employee has ever attempted
 * (not one query per quiz), one MysteryShopperResult query across every
 * PUBLISHED period (not one query per period), and one EmploymentAssignment
 * lookup. Never N+1.
 */
export async function getManagementEmployeeCard(
  targetUserId: string,
  targetProfile: { clubId: string; cityId: string; positionId: string },
): Promise<ManagementEmployeeCardDTO> {
  const [user, trainingDetail, tests, mysteryRows, employment] = await Promise.all([
    prisma.user.findUnique({ where: { id: targetUserId }, select: { displayName: true, avatarStorageKey: true } }),
    getEmployeeTrainingDetail(targetUserId),
    getEmployeeTestSummaries(targetUserId),
    loadPublishedMysteryResults(targetUserId),
    // Round E0's audit finding: this table is schema-only today — nothing
    // writes to it yet, so this will be null for every employee until a
    // future round builds the write/backfill path. Never a stand-in from
    // the account's own registration timestamp — that is a different,
    // untruthful signal (see cabinet-ui.ts's formatTenureRu doc comment).
    prisma.employmentAssignment.findFirst({
      where: { userId: targetUserId, endedAt: null },
      orderBy: { startedAt: "desc" },
      select: { startedAt: true },
    }),
  ]);

  return {
    profile: {
      displayName: user?.displayName ?? "—",
      avatarUrl: avatarUrlForKey(user?.avatarStorageKey ?? null),
      position: getPositionById(targetProfile.positionId)?.title ?? null,
      clubName: getClubById(targetProfile.clubId)?.name ?? null,
      cityName: getCityById(targetProfile.cityId)?.name ?? null,
    },
    employment: { startedAt: employment?.startedAt?.toISOString() ?? null },
    learning: { overall: trainingDetail.overall, programs: trainingDetail.programs },
    tests,
    mysteryShopper: { latest: mysteryRows[0] ?? null, history: mysteryRows },
  };
}

/**
 * Section 8 — one row per quiz this employee has ever attempted, from a
 * SINGLE QuizAttempt query (never one query per quiz) plus a single
 * follow-up Quiz query for titles. `scorePercent`/`passed`/`startedAt`/
 * `completedAt` only — never `answers` (the raw submission) and never a
 * join through QuizOption.isCorrect; correct answers can never leak through
 * this path (the select clause below has no way to carry them). The actual
 * per-quiz aggregation (latest/best/attempt count) is pure logic, extracted
 * to employee-card-core.ts for direct, DB-free test coverage.
 */
async function getEmployeeTestSummaries(userId: string): Promise<ManagementEmployeeTestSummaryDTO[]> {
  const attempts = await prisma.quizAttempt.findMany({
    where: { userId },
    orderBy: { startedAt: "desc" },
    select: { quizId: true, scorePercent: true, passed: true, startedAt: true, completedAt: true },
  });
  if (attempts.length === 0) return [];

  const quizIds = [...new Set(attempts.map((a) => a.quizId))];
  const quizzes = await prisma.quiz.findMany({ where: { id: { in: quizIds } }, select: { id: true, title: true } });
  const titleById = new Map(quizzes.map((q) => [q.id, q.title]));

  return aggregateQuizAttempts(attempts, titleById);
}

/**
 * Section 10 — PUBLISHED only; a DRAFT result (SPM still working on it)
 * must never reach any employee-facing or management-facing read, not even
 * to be hidden client-side. One query, ordered newest period first.
 */
async function loadPublishedMysteryResults(employeeUserId: string): Promise<ManagementEmployeeMysteryResultDTO[]> {
  const rows = await prisma.mysteryShopperResult.findMany({
    where: { employeeUserId, status: "PUBLISHED" },
    orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }],
    select: { periodMonth: true, periodYear: true, score: true, comment: true },
  });
  return rows.map((r) => ({ periodLabel: ruMonthYear(r.periodMonth, r.periodYear), score: r.score, comment: r.comment }));
}
