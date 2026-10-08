import "server-only";
import { prisma } from "./db";
import { getPositionById } from "@/content/positions";
import { pluralRu, distinctCityNames } from "@/lib/cabinet-ui";
import { loadEmployees } from "./rbac/cabinet-dashboards";
import type { ClubSummary } from "./rbac/context";
import { averageScore, buildClubRows, buildEmployeeRows, derivePeriods, pickSelectedPeriod } from "./mystery-shopper-core";
import type { ManagementMysteryShopperDTO } from "@/lib/api/cabinet-types";

/**
 * Management Round E3 — the real management Mystery Shopper workspace for
 * CLUB_MANAGER (own club) and CITY_MANAGER (effective scope, or a
 * drill-down into one scoped club). Dispatched entirely by the ROUTE
 * (src/app/api/control/cabinet/mystery-shopper/route.ts), the exact same
 * split club-manager/route.ts already uses: the route resolves WHICH scope
 * applies (resolveClubManagerCabinetAccess, then a CITY_MANAGER-root
 * fallback) and calls one of these two "dumb" functions with an
 * already-authorized scope — neither function here re-derives or
 * re-checks authorization itself.
 *
 * ============================================================================
 * HISTORICAL ATTRIBUTION — READ THIS BEFORE CHANGING ANYTHING BELOW
 * ============================================================================
 * MysteryShopperResult (prisma/schema.prisma) carries only employeeUserId +
 * periodMonth/periodYear + score/comment/status — no clubId, no cityId, no
 * club/employment snapshot of any kind. There is therefore no truthful way
 * to say "this result was produced while the employee worked at club X" —
 * only "this employee, who is CURRENTLY on club X's roster, has this
 * result." Both functions below resolve club/city membership via
 * loadEmployees — i.e. EmployeeProfile.clubId TODAY, not at the time the
 * result was published. An employee who has since transferred clubs will
 * have their OLD results attributed to their NEW club here, and dropped
 * from their old one — the only honest reading available from this schema.
 * Every DTO field/copy this produces is written as "results of employees
 * CURRENTLY on this team", never "this club's historical performance",
 * and no "club trend over time" is computed anywhere. If a genuine
 * historical club/employment snapshot is ever added to the schema, this
 * module should be revisited — until then, this is not a bug to silently
 * "fix" by inventing a field (round brief section 26's explicit
 * instruction).
 * ============================================================================
 *
 * PERFORMANCE — exactly one MysteryShopperResult read per call (never one
 * per employee, never one per club, never one per period): all
 * of a scope's PUBLISHED rows, for every current employee in scope, across
 * every period, fetched once and aggregated in memory below. Bounded by
 * the scope's own employee count (one club's roster, or every employee
 * across a CITY_MANAGER's clubs) — never by company-wide row count.
 *
 * NO THRESHOLD — nothing here classifies a score as good/bad/needs
 * attention; it is never written into any attention list.
 */

interface PeriodParams {
  periodMonth: number | null;
  periodYear: number | null;
}

/** One PUBLISHED-only, scope-bounded query, shared by both functions below
 * — the literal single source of "every Mystery Shopper fact this request
 * is allowed to see." */
async function loadPublishedResults(userIds: string[]) {
  if (userIds.length === 0) return [];
  return prisma.mysteryShopperResult.findMany({
    where: { employeeUserId: { in: userIds }, status: "PUBLISHED" },
    select: { employeeUserId: true, periodMonth: true, periodYear: true, score: true },
  });
}

/** Section 8 — CLUB_MANAGER's own club, or a CITY_MANAGER's drill-down
 * into one scoped club (resolveClubManagerCabinetAccess's tier 4) — same
 * shape either way, per the round brief's own observation that the two
 * screens need identical content. `isPreviewing` only informs
 * `scope.isPreviewing` (an optional UI hint) — it never changes WHICH
 * club's data is read; that was already decided by the caller resolving
 * `clubId` itself (section 23: View-As CLUB_MANAGER already resolves to
 * the previewed club via that same existing resolution, so this reflects
 * the preview for free, with no new RBAC surface). */
export async function getClubMysteryShopper(
  clubId: string,
  clubName: string | null,
  isPreviewing: boolean,
  period: PeriodParams,
): Promise<ManagementMysteryShopperDTO> {
  const employeeRows = await loadEmployees([clubId]);
  const userIds = employeeRows.map((e) => e.userId);
  const results = await loadPublishedResults(userIds);

  const periods = derivePeriods(results);
  const selectedPeriod = pickSelectedPeriod(periods, { month: period.periodMonth, year: period.periodYear });

  const scoreByUserId = new Map<string, number>();
  if (selectedPeriod) {
    for (const r of results) {
      if (r.periodMonth === selectedPeriod.month && r.periodYear === selectedPeriod.year) {
        scoreByUserId.set(r.employeeUserId, r.score);
      }
    }
  }

  const employees = buildEmployeeRows(
    employeeRows.map((e) => ({ userId: e.userId, displayName: e.displayName, position: getPositionById(e.positionId)?.title ?? null })),
    scoreByUserId,
  ).sort((a, b) => a.displayName.localeCompare(b.displayName, "ru"));

  return {
    scope: { kind: "CLUB", clubId, clubName, isPreviewing },
    periods,
    selectedPeriod,
    summary: { averageScore: averageScore([...scoreByUserId.values()]), resultCount: scoreByUserId.size },
    employees,
  };
}

/** Section 9 — CITY_MANAGER's root scope: every club their active grants
 * cover (already resolved by the caller via resolveCityManagerClubs — the
 * SAME dynamic CITY-expands-to-its-clubs + CLUB-point-exception union
 * every other CITY_MANAGER read already uses). The city-wide summary is
 * computed directly over the FLAT set of every individual employee result
 * in scope — deliberately NOT `average(clubs.map(c => c.summary.averageScore))`,
 * which would incorrectly weight a 2-person club the same as a 20-person
 * one (section 9's explicit anti-pattern). */
export async function getCityMysteryShopper(clubs: ClubSummary[], period: PeriodParams): Promise<ManagementMysteryShopperDTO> {
  const cityNames = distinctCityNames(clubs);
  const scopeLabel =
    clubs.length === 0
      ? "Нет клубов в зоне ответственности"
      : cityNames.length === 0
        ? pluralRu(clubs.length, "клуб", "клуба", "клубов")
        : cityNames.length === 1
          ? cityNames[0]
          : `Города: ${cityNames.join(", ")}`;

  if (clubs.length === 0) {
    return { scope: { kind: "CITY", scopeLabel }, periods: [], selectedPeriod: null, summary: { averageScore: null, resultCount: 0 }, clubs: [] };
  }

  const clubIds = clubs.map((c) => c.id);
  const employeeRows = await loadEmployees(clubIds);
  const userIds = employeeRows.map((e) => e.userId);
  const results = await loadPublishedResults(userIds);

  const periods = derivePeriods(results);
  const selectedPeriod = pickSelectedPeriod(periods, { month: period.periodMonth, year: period.periodYear });

  const scoreByUserId = new Map<string, number>();
  if (selectedPeriod) {
    for (const r of results) {
      if (r.periodMonth === selectedPeriod.month && r.periodYear === selectedPeriod.year) {
        scoreByUserId.set(r.employeeUserId, r.score);
      }
    }
  }

  const userIdsByClub = new Map<string, string[]>();
  for (const e of employeeRows) {
    const list = userIdsByClub.get(e.clubId) ?? [];
    list.push(e.userId);
    userIdsByClub.set(e.clubId, list);
  }
  const clubRows = buildClubRows(
    clubs.map((c) => ({ id: c.id, name: c.name })),
    userIdsByClub,
    scoreByUserId,
  );

  return {
    scope: { kind: "CITY", scopeLabel },
    periods,
    selectedPeriod,
    summary: { averageScore: averageScore([...scoreByUserId.values()]), resultCount: scoreByUserId.size },
    clubs: clubRows,
  };
}
