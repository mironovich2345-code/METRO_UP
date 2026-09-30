import { getOwnerKey } from "./owner";

/**
 * Sprint: mini-app-performance — cache key builders for the client-side SWR
 * layer (query-cache.ts). Every key is a plain string, always built through
 * one of these functions — no screen ever hand-writes a key string.
 *
 * SECURITY (section 5/17): every key embeds the current owner key
 * (owner.ts — the Telegram WebApp user id, the SAME identity
 * home-context-storage.ts's own `ownerKey` already scopes localStorage by)
 * right after its category prefix. This is DEFENSE IN DEPTH on top of the
 * SWR cache's own natural isolation (one in-memory Map per browser tab / one
 * Telegram WebView per account — a different Telegram user is a different
 * process with its own fresh JS heap): even in an unexpected same-tab
 * account-switch scenario, a leftover cached response can never be read
 * back under a different account's key, because the key itself would
 * differ. The owner segment sits AFTER the category prefix (`home:`,
 * `team:`, …), not before, so `cacheKeyPrefixes` below still matches every
 * owner's entries for coarse invalidation without itself needing to know
 * the current owner.
 *
 * The other identity dimension that CAN change within a single
 * already-running session is View As (the same real user, same tab,
 * different effective persona) — every key that reads differently while
 * previewing embeds a preview marker (see `previewTag`), AND
 * query-cache.ts's `clearAllQueries()` is called on every
 * viewAsApi.start()/end() as a belt-and-suspenders full flush, so a stale
 * previewed response can never leak into (or out of) the real context even
 * if a key were ever missing its preview marker.
 *
 * Cache keys are advisory for RENDERING ONLY. No key, and no cached value,
 * is ever consulted for an authorization decision — every route this app
 * calls re-derives access from the real session + current grants on every
 * actual network request (cache hits only change what renders WHILE that
 * request is in flight, never whether it's made or trusted).
 */

/** True while a View-As persona preview (MANAGER/CLUB_MANAGER substitution
 * OR a CITY_MANAGER self-preview) is active — the one client-visible signal
 * available (ViewContextDTO carries no clubId, only previewRole/scopeLabel),
 * so it is the whole of what a key can embed; broad clearAllQueries() on
 * start/end covers the rest (see module doc above). */
function previewTag(isPreviewing: boolean, previewRole?: string | null): string {
  return isPreviewing ? `preview:${previewRole ?? "?"}` : "live";
}

/** `{category}:{owner}:{...rest}` — see module doc for why owner sits here. */
function key(category: string, ...rest: string[]): string {
  return [category, getOwnerKey(), ...rest].join(":");
}

export const cacheKeys = {
  /** Home renders exactly one of PERSONAL/CITY_MANAGER/CLUB_MANAGER — the
   * requested context + clubId hint (same values sent as query params) plus
   * the preview tag fully identify which response shape is being asked for. */
  home: (opts: { context?: string | null; clubId?: string | null; isPreviewing: boolean; previewRole?: string | null }) =>
    key("home", opts.context ?? "default", opts.clubId ?? "-", previewTag(opts.isPreviewing, opts.previewRole)),

  planToday: () => key("plan"),

  /** Academy role section — a MANAGER can never fabricate CITY_MANAGER's
   * section (server re-validates), but the CACHE key still must not conflate
   * two different sections' responses. (View As is not embedded here — a
   * preview's Academy content is position-gated the same way for every
   * screen, and query-cache.ts's clearAllQueries() on every preview
   * start/end is the safety net for this key, same as every other
   * non-home/team key below.) */
  academyOverview: (section: string) => key("academy-overview", section),
  academyDay: (dayId: string) => key("academy-day", dayId),
  academyLesson: (slug: string, preview: boolean) => key("academy-lesson", slug, preview ? "preview" : "live"),

  /** GET /api/rating takes no mode param — "Менеджеры"/"Клубы" is a purely
   * client-side render toggle over the ONE fetched board (confirmed by
   * reading ranking/page.tsx: "clubs" renders a static placeholder, no
   * second request) — so there is only ever one real response to key,
   * never one per mode. */
  ratingBoard: () => key("rating"),

  profileManagementRoles: () => key("profile-management-roles"),

  /** `clubId` is the explicit drill-down target when present (CITY_MANAGER
   * viewing a specific club) or "own" for a CLUB_MANAGER's own-club flow
   * (server-resolved, no clubId on the wire) — these are genuinely different
   * requests and must never share a cache entry. */
  team: (clubId: string | null, isPreviewing: boolean) => key("team", clubId ?? "own", previewTag(isPreviewing)),
  /** "Which clubs do I personally manage" — GET /api/control/club/clubs,
   * only ever fetched for the real CLUB_MANAGER's own no-clubId flow. */
  myManagedClubs: () => key("team-my-clubs"),
  employeeTraining: (userId: string) => key("employee-training", userId),

  cityDashboard: () => key("city-dashboard"),
  cityClub: (clubId: string) => key("city-club", clubId),
  cityManagers: () => key("city-managers"),
  cityTraining: () => key("city-training"),

  /** Published, shareable knowledge-base content — no per-user data at all
   * (section 5's own named "knowledge-base metadata/content" candidate). */
  scripts: () => key("scripts"),
  scriptDetail: (slug: string) => key("script-detail", slug),
  instructions: () => key("instructions"),
  instructionDetail: (slug: string) => key("instruction-detail", slug),

  /** Sprint: mini-app-cold-start — read directly by AppUserProvider (never
   * through useQuery), so this key is never inside a `previewTag`/context —
   * it identifies one thing only: this owner's last confirmed identity. */
  identitySnapshot: () => key("identity-snapshot"),
} as const;

/** Prefix helpers for coarse, category-wide invalidation (query-cache.ts's
 * invalidatePrefix) — matched via `key.startsWith(prefix)`, never a regex
 * over untrusted data. Category-only (no owner segment) is deliberate: it
 * matches every owner this tab has ever cached under (in practice, always
 * exactly one — see module doc), so a mutation's invalidation never has to
 * know or guess the current owner key itself. */
export const cacheKeyPrefixes = {
  home: "home",
  academy: "academy",
  team: "team",
  city: "city",
} as const;
