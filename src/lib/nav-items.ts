/**
 * Bottom-navigation routes — pure data/logic (no React import), unit
 * testable like the rest of this file.
 *
 * PERSONAL (the pre-existing employee bar): exactly five entries —
 * Главная · Академия · Метрик · База · Рейтинг. "Метрик" is the raised
 * central entry. "База" is the single Knowledge Hub entry (Scripts +
 * Instructions live under it). Profile is NOT a bottom-nav tab anywhere,
 * for any context — it is, and remains, reached only via the avatar in
 * Home's own header. This is a permanent product rule, not a Round A
 * omission: do not add a Profile entry to any nav set below.
 *
 * METRO UP ROUND 1, Management UX Round A — two ADDITIVE management nav
 * sets (CLUB_MANAGER, CITY_MANAGER). Metric is deliberately absent from
 * both: it is dropped from the management bar, not relabeled or replaced
 * — /metric itself is untouched and still reachable by URL, and whether it
 * becomes a floating assistant action is a separate, later round (section
 * 2's explicit instruction). Neither management set has a `central` entry.
 */
export interface BottomNavRoute {
  href: string;
  label: string;
  /** Extra path prefixes that keep this tab active. */
  match?: string[];
  /** The raised central action (Метрик) — rendered distinctly. PERSONAL only. */
  central?: boolean;
}

export const BOTTOM_NAV_ROUTES: BottomNavRoute[] = [
  { href: "/home", label: "Главная" },
  { href: "/academy", label: "Академия" },
  { href: "/metric", label: "Метрик", central: true },
  { href: "/knowledge", label: "База", match: ["/scripts", "/instructions"] },
  { href: "/ranking", label: "Рейтинг" },
];

/** CLUB_MANAGER — section 1's approved set. "Команда" stays active under
 * /team/employee for free (a real sub-path, matched by isActive's own
 * prefix rule below) — no explicit `match` needed. */
export const CLUB_MANAGER_NAV_ROUTES: BottomNavRoute[] = [
  { href: "/home", label: "Главная" },
  { href: "/team", label: "Команда" },
  { href: "/plan", label: "План" },
  { href: "/academy", label: "Академия" },
];

/** CITY_MANAGER — section 1's approved NOW set (4 items; "Показатели"
 * stays deliberately absent until a real indicator exists — section 1's
 * explicit "do NOT expose yet"). "Клубы" needs an explicit `match` array:
 * unlike /team/employee, /city/club и /city/managers и /city/training are
 * SIBLINGS of /city, not sub-paths of it (the exact same reason "База"
 * already needs match:["/scripts","/instructions"] above) — /questions/[id]
 * and /questions/ask need no such entry, they are real sub-paths of
 * /questions already covered by isActive's prefix rule. */
export const CITY_MANAGER_NAV_ROUTES: BottomNavRoute[] = [
  { href: "/home", label: "Главная" },
  { href: "/city", label: "Клубы", match: ["/city/club", "/city/managers", "/city/training"] },
  { href: "/questions", label: "Вопросы" },
  { href: "/academy", label: "Академия" },
];

/** The three Mini App management contexts a nav set can resolve to —
 * "PERSONAL" covers both the real plain-employee case and every fallback
 * (no stored context yet, an unsupported/future context, a non-persona
 * View-As preview) — see resolveEffectiveNavContext's own doc. */
export type ManagementNavContext = "PERSONAL" | "CLUB_MANAGER" | "CITY_MANAGER";

/**
 * Section 4/5 — the ONE decision "which nav set should presentation use
 * right now", given the real last-server-confirmed stored context
 * (home-context-storage.ts's own StoredHomeContext — never a second state
 * system) and any active View-As preview.
 *
 * Section 5, HIGH PRIORITY — persona-substitution previews (previewRole
 * "MANAGER" or "CLUB_MANAGER" — real identity substitution, see
 * effective-context.ts's own isPersonaPreview) OVERRIDE the real actor's
 * stored context entirely: a CITY_MANAGER previewing CLUB_MANAGER sees the
 * CLUB_MANAGER nav, never their own real CITY_MANAGER nav, regardless of
 * what is sitting in storage. previewRole "CITY_MANAGER" is the existing
 * CITY_MANAGER SELF-preview ("jump back to top-level view") — NOT persona
 * substitution (isPersonaPreview excludes it) — so it is deliberately NOT
 * special-cased here; it falls through to the real stored context exactly
 * like "no preview at all" would, which is already correct since a
 * self-preview is, by definition, the real actor seeing their own real
 * context.
 *
 * An unrecognized/missing stored context (fresh session, or a value this
 * function doesn't recognize) falls back to "PERSONAL" — an allowlist, not
 * a denylist, so a future unsupported context can never accidentally
 * surface a management nav (section 19's explicit "unsupported future
 * context does not accidentally expose management navigation").
 */
export function resolveEffectiveNavContext(params: {
  storedContextType: "PERSONAL" | "CLUB_MANAGER" | "CITY_MANAGER" | null | undefined;
  previewRole: "MANAGER" | "CLUB_MANAGER" | "CITY_MANAGER" | null | undefined;
}): ManagementNavContext {
  if (params.previewRole === "MANAGER") return "PERSONAL";
  if (params.previewRole === "CLUB_MANAGER") return "CLUB_MANAGER";
  if (params.storedContextType === "CLUB_MANAGER" || params.storedContextType === "CITY_MANAGER") {
    return params.storedContextType;
  }
  return "PERSONAL";
}

/** Round A.1, section A — a root screen shared with PERSONAL (/plan,
 * /academy) uses this to decide WHETHER to show the management-only
 * avatar/Profile entry at all, without caring WHICH management context it
 * is. PERSONAL keeps its own, already-existing header untouched either way. */
export function isManagementNavContext(context: ManagementNavContext): boolean {
  return context === "CLUB_MANAGER" || context === "CITY_MANAGER";
}

/**
 * accessStatus=LIMITED sees only Академия (the approved LIMITED whitelist —
 * Home/Метрик/База/Рейтинг are FULL-only, see requireFullAccess in authz.ts).
 * Sprint 1 / Phase 2B, section 9: access-aware navigation, not a nav that
 * links to tabs the server will 403 the moment they're opened.
 *
 * accessStatus=PENDING_APPROVAL (Sprint: mini-app-role-experience, section 2)
 * sees Главная + Академия — Home now serves that state its own deliberately
 * tiny OnboardingHomeDTO (see home.ts/api/home/route.ts), so unlike LIMITED it
 * is NOT Academy-only; Метрик/База/Рейтинг stay hidden (still FULL-only
 * server-side, and section 2 explicitly excludes them from this state).
 *
 * METRO UP, Management UX Round A, section 19 — accessStatus is checked
 * FIRST, unconditionally, before `effectiveContext` is ever consulted: a
 * PENDING_APPROVAL/LIMITED actor can never see a management nav set no
 * matter what a stale/forged stored context says — this mirrors
 * canShowAskQuestionEntry's own "access status gates before context does"
 * precedent exactly. `effectiveContext` defaults to "PERSONAL" so every
 * pre-existing call site (the only one today already passes a single
 * argument in several tests) keeps returning the unchanged 5-item bar.
 */
export function visibleBottomNavRoutes(accessStatus: string | null | undefined, effectiveContext: ManagementNavContext = "PERSONAL"): BottomNavRoute[] {
  if (accessStatus === "LIMITED") return BOTTOM_NAV_ROUTES.filter((r) => r.href === "/academy");
  if (accessStatus === "PENDING_APPROVAL") {
    return BOTTOM_NAV_ROUTES.filter((r) => r.href === "/home" || r.href === "/academy");
  }
  switch (effectiveContext) {
    case "CLUB_MANAGER":
      return CLUB_MANAGER_NAV_ROUTES;
    case "CITY_MANAGER":
      return CITY_MANAGER_NAV_ROUTES;
    default:
      return BOTTOM_NAV_ROUTES;
  }
}

/**
 * Section 15 — route-to-active-tab matching. Moved here (pure, no React)
 * from bottom-navigation.tsx verbatim — same logic, same behavior, now
 * directly unit-testable like the rest of this file rather than only
 * reachable through a rendered component this repo has no DOM harness for.
 */
export function isActiveNavRoute(pathname: string, item: BottomNavRoute): boolean {
  return (
    pathname === item.href ||
    pathname.startsWith(`${item.href}/`) ||
    (item.match?.some((p) => pathname === p || pathname.startsWith(`${p}/`)) ?? false)
  );
}

/**
 * Sprint: LIVE QA FIX QA-01B, section 13 — is this tab tap a navigation to
 * the route ALREADY on screen? Exact pathname equality only, deliberately
 * narrower than isActiveNavRoute: on /team/employee the "Команда" tab is
 * ACTIVE (prefix match) but tapping it is a real navigation back to /team,
 * and must stay one. Only a tap on the exact current root is a no-op —
 * no push, no re-render, no Next.js scroll-into-view, no refetch.
 */
export function isSameRouteNavTap(pathname: string, href: string): boolean {
  return pathname === href;
}

/**
 * Sprint: LIVE QA FIX QA-01B, section 13 — the click handler every bottom-nav
 * item runs, kept here (pure: the haptic is injected) so the exact
 * production logic has real test coverage. A tap on the route already on
 * screen calls preventDefault(): next/link runs our onClick FIRST and then
 * returns early when `e.defaultPrevented` is set (verified in the installed
 * next/dist/client/app-dir/link.js), and the native anchor navigation is
 * cancelled too — so there is no push, no re-render, no scroll-into-view,
 * and no selection haptic for a selection that did not change. Every other
 * tap — including an active-by-prefix tab like "Команда" on /team/employee
 * — gets the selection haptic and navigates exactly as before.
 */
export function applyNavTap(
  event: { preventDefault(): void },
  isCurrentRoute: boolean,
  onNavigateFeedback: () => void,
): void {
  if (isCurrentRoute) {
    event.preventDefault();
    return;
  }
  onNavigateFeedback();
}
