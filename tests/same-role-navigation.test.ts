import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { motion } from "framer-motion";
import { cardIn, staggerStack, rootScreenEntranceInitial } from "../src/lib/motion";
import {
  BOTTOM_NAV_ROUTES,
  CITY_MANAGER_NAV_ROUTES,
  CLUB_MANAGER_NAV_ROUTES,
  applyNavTap,
  isActiveNavRoute,
  isSameRouteNavTap,
  resolveEffectiveNavContext,
  visibleBottomNavRoutes,
  type BottomNavRoute,
} from "../src/lib/nav-items";
import { resolveInitialAcademySectionKey, resolveTeamAccessMode, resolveTeamSelectedClubId } from "../src/lib/cabinet-ui";
import { loadStoredContext, onStoredContextChanged, saveStoredContext } from "../src/lib/home-context-storage";
import { cacheKeys } from "../src/lib/client/cache-keys";
import { setOwnerKey } from "../src/lib/client/owner";

const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");

/**
 * Sprint: LIVE QA FIX QA-01B — "Same-Role Screen Navigation Flicker".
 *
 * Root causes traced (see the QA-01B report for the frame-by-frame trace):
 *  1. BottomNavigation is rendered inside each page, so it remounts on every
 *     navigation, and useEffectiveNavContext started at useState(null) with
 *     the real value only read in a post-paint effect — every remount's
 *     first frame showed the PERSONAL bar to CLUB_MANAGER/CITY_MANAGER.
 *  2. Every root tab screen replayed a staggered opacity-0 + blur + offset
 *     entrance on mount, so even fully cached content was invisible on the
 *     first frame and re-materialized on each tab switch.
 *  3. Home/Academy/Team built their SWR keys from values resolved in a
 *     post-paint effect, so their first render had a null key — a skeleton —
 *     even when the destination was cached. Home's Academy prefetch also
 *     warmed a different key than /academy actually reads.
 *
 * REAL tests below exercise the actual product functions (and, for the
 * entrance, the real React renderer + the real framer-motion package with
 * this app's own variants). Structural tests are supplementary wiring
 * proof only, for the parts that need a browser/DOM harness this repo
 * doesn't have.
 */

/* --------------------------------------------------------------------- *
 *  Browser-storage stubs for the storage-contract tests. Installed only for
 *  the duration of each such test and always restored, so nothing leaks into
 *  the real-render tests below (node:test runs top-level tests in order).
 * --------------------------------------------------------------------- */

function withBrowserStorage<T>(fn: () => T): T {
  const g = globalThis as unknown as Record<string, unknown>;
  const hadWindow = "window" in g;
  const hadLocalStorage = "localStorage" in g;
  const prevWindow = g.window;
  const prevLocalStorage = g.localStorage;
  const store = new Map<string, string>();
  g.localStorage = {
    getItem: (k: string) => (store.has(k) ? (store.get(k) as string) : null),
    setItem: (k: string, v: string) => {
      store.set(k, String(v));
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
  };
  g.window = new EventTarget();
  try {
    return fn();
  } finally {
    if (hadWindow) g.window = prevWindow;
    else delete g.window;
    if (hadLocalStorage) g.localStorage = prevLocalStorage;
    else delete g.localStorage;
  }
}

/** Exactly the composition bottom-navigation.tsx's useSyncExternalStore
 * getSnapshot performs (`loadStoredContext(getOwnerKey())?.type ?? null`),
 * with the owner passed explicitly — see SRN-W for the wiring check. */
function readStoredType(ownerKey: string) {
  return loadStoredContext(ownerKey)?.type ?? null;
}

/* ===================================================================== *
 *  1. Effective nav context — correct on the FIRST frame
 * ===================================================================== */

test("SRN-A: THE BUG, exact frame-1 output — the old null-initialised nav context resolves a CITY_MANAGER/CLUB_MANAGER to PERSONAL, i.e. the 5-item personal bar with the raised Метрик button instead of their own 4-item bar", () => {
  const oldFirstFrame = resolveEffectiveNavContext({ storedContextType: null, previewRole: null });
  assert.equal(oldFirstFrame, "PERSONAL");
  const bar = visibleBottomNavRoutes("FULL", oldFirstFrame);
  assert.equal(bar.length, 5);
  assert.ok(bar.some((r) => r.central), "the PERSONAL bar includes the raised central Метрик item");
  assert.notDeepEqual(bar, CITY_MANAGER_NAV_ROUTES);
  assert.notDeepEqual(bar, CLUB_MANAGER_NAV_ROUTES);
});

test("SRN-B: THE FIX — the persisted context is readable synchronously (no effect, no microtask), so the nav resolves the management bar on the very first render", () => {
  withBrowserStorage(() => {
    saveStoredContext("u-city", { type: "CITY_MANAGER" });
    const firstFrameType = readStoredType("u-city");
    assert.equal(firstFrameType, "CITY_MANAGER");
    const context = resolveEffectiveNavContext({ storedContextType: firstFrameType, previewRole: null });
    assert.equal(context, "CITY_MANAGER");
    assert.deepEqual(visibleBottomNavRoutes("FULL", context), CITY_MANAGER_NAV_ROUTES);

    saveStoredContext("u-club", { type: "CLUB_MANAGER", clubId: "club-1" });
    const clubContext = resolveEffectiveNavContext({ storedContextType: readStoredType("u-club"), previewRole: null });
    assert.deepEqual(visibleBottomNavRoutes("FULL", clubContext), CLUB_MANAGER_NAV_ROUTES);
  });
});

test("SRN-C: snapshot stability — consecutive reads return identical primitives (===), the contract useSyncExternalStore needs to never re-render in a loop", () => {
  withBrowserStorage(() => {
    saveStoredContext("u1", { type: "CLUB_MANAGER", clubId: "club-1" });
    const a = readStoredType("u1");
    const b = readStoredType("u1");
    assert.equal(typeof a, "string");
    assert.ok(a === b);
  });
});

test("SRN-D: the lifetime subscription still works (Round B.1's stale-nav fix, preserved) — a same-tab write notifies the subscriber synchronously, and unsubscribing stops it", () => {
  withBrowserStorage(() => {
    let notified = 0;
    const unsubscribe = onStoredContextChanged(() => {
      notified += 1;
    });
    saveStoredContext("u1", { type: "CITY_MANAGER" });
    assert.equal(notified, 1, "notified synchronously, at the moment of the write");
    assert.equal(readStoredType("u1"), "CITY_MANAGER", "and the new value is readable inside/after that notification");
    unsubscribe();
    saveStoredContext("u1", { type: "PERSONAL" });
    assert.equal(notified, 1, "no notification after unsubscribe");
  });
});

test("SRN-E: owner isolation — another Telegram account's stored context reads as null, so the synchronous read can never surface a different account's management bar", () => {
  withBrowserStorage(() => {
    saveStoredContext("owner-a", { type: "CITY_MANAGER" });
    assert.equal(readStoredType("owner-b"), null);
    assert.equal(resolveEffectiveNavContext({ storedContextType: readStoredType("owner-b"), previewRole: null }), "PERSONAL");
  });
});

test("SRN-F: QA-01 regression — an active persona preview still overrides the stored context on the first frame (CLUB_MANAGER preview -> CLUB_MANAGER bar; MANAGER preview -> PERSONAL bar)", () => {
  assert.equal(resolveEffectiveNavContext({ storedContextType: "CITY_MANAGER", previewRole: "CLUB_MANAGER" }), "CLUB_MANAGER");
  assert.equal(resolveEffectiveNavContext({ storedContextType: "CITY_MANAGER", previewRole: "MANAGER" }), "PERSONAL");
});

/* ===================================================================== *
 *  2. Entrance animation — REAL render (React + framer-motion + this app's
 *     own variants): what a root screen's card looks like on frame 1
 * ===================================================================== */

function renderRootScreenCard(initial: "hidden" | false): string {
  return renderToStaticMarkup(
    createElement(
      motion.main,
      { variants: staggerStack, initial, animate: "show" },
      createElement(motion.div, { variants: cardIn, id: "card" }, "content"),
    ),
  );
}

test("SRN-G: THE BUG, real render — with initial=\"hidden\" a root screen's card is painted at opacity 0, blurred 6px and offset 18px on its first frame, even though its content is already there", () => {
  const html = renderRootScreenCard("hidden");
  assert.match(html, /id="card" style="[^"]*opacity:0/);
  assert.match(html, /blur\(6px\)/);
  assert.match(html, /translateY\(18px\)/);
});

test("SRN-H: THE FIX, real render — every root screen after the session's first gets initial=false, so its card is fully visible on frame 1: opacity 1, no blur, no offset", () => {
  const initial = rootScreenEntranceInitial(true);
  assert.equal(initial, false);
  const html = renderRootScreenCard(initial);
  assert.match(html, /id="card" style="[^"]*opacity:1/);
  assert.doesNotMatch(html, /opacity:0/);
  assert.doesNotMatch(html, /blur\(6px\)/);
  assert.doesNotMatch(html, /translateY\(18px\)/);
});

test("SRN-I: the cold-open reveal is preserved — only the session's FIRST root screen still gets \"hidden\" (and therefore the rise-in)", () => {
  assert.equal(rootScreenEntranceInitial(false), "hidden");
});

test("SRN-J (structural): all nine root tab screens take their stagger container's `initial` from useRootScreenEntrance(); none keeps a literal initial=\"hidden\" except Ranking's in-page \"Клубы\" toggle card, which only mounts on a user tap (mode resets to \"managers\" on every mount)", () => {
  const roots = [
    "src/app/home/page.tsx",
    "src/app/academy/page.tsx",
    "src/app/team/page.tsx",
    "src/app/plan/page.tsx",
    "src/app/city/page.tsx",
    "src/app/questions/page.tsx",
    "src/app/knowledge/page.tsx",
    "src/app/ranking/page.tsx",
    "src/app/metric/page.tsx",
  ];
  for (const file of roots) {
    const src = read(file);
    assert.match(src, /const entranceInitial = useRootScreenEntrance\(\);/, `${file} must call useRootScreenEntrance()`);
    assert.match(src, /initial=\{entranceInitial\}/, `${file} must use it on its stagger container`);
    const hiddenCount = (src.match(/initial="hidden"/g) ?? []).length;
    if (file === "src/app/ranking/page.tsx") {
      assert.equal(hiddenCount, 1, "only the in-page Клубы toggle card");
      assert.match(src, /mode === "clubs" && \(\s*\n\s*<motion\.div variants=\{cardIn\} initial="hidden"/);
    } else {
      assert.equal(hiddenCount, 0, `${file} must not replay the entrance on navigation`);
    }
  }
  // Academy's nested day grid is its own variant-controlling container —
  // it must use the same value, or its day cards would still re-animate.
  const academy = read("src/app/academy/page.tsx");
  assert.equal((academy.match(/initial=\{entranceInitial\}/g) ?? []).length, 2);
});

test("SRN-K (structural): useRootScreenEntrance captures its value once per mount and flips the session flag only in an effect (after the first root screen commits), never during render", () => {
  const src = read("src/lib/client/root-screen-entrance.ts");
  assert.match(src, /const \[initial\] = useState\(\(\) => rootScreenEntranceInitial\(rootScreenShown\)\);/);
  assert.match(src, /useEffect\(\(\) => \{\s*\n\s*rootScreenShown = true;\s*\n\s*\}, \[\]\);/);
  assert.doesNotMatch(src, /setTimeout|setInterval|requestAnimationFrame/);
});

/* ===================================================================== *
 *  3. Cached destinations — keys are computable on the FIRST render
 * ===================================================================== */

test("SRN-L: resolveInitialAcademySectionKey — nothing stored -> \"default\" (server's MANAGER-first fallback); PERSONAL trains as MANAGER; management contexts map to their own section", () => {
  assert.equal(resolveInitialAcademySectionKey(null), "default");
  assert.equal(resolveInitialAcademySectionKey(undefined), "default");
  assert.equal(resolveInitialAcademySectionKey({ type: "PERSONAL" }), "MANAGER");
  assert.equal(resolveInitialAcademySectionKey({ type: "CLUB_MANAGER" }), "CLUB_MANAGER");
  assert.equal(resolveInitialAcademySectionKey({ type: "CITY_MANAGER" }), "CITY_MANAGER");
});

test("SRN-M: THE PREFETCH BUG — for a MANAGER (stored PERSONAL), Home used to warm academyOverview(\"default\") while /academy reads academyOverview(\"MANAGER\"): two keys, so the warm-up was never used. The shared derivation makes the prefetched key and /academy's first-render key identical", () => {
  setOwnerKey("owner-1");
  const stored = { type: "PERSONAL" as const };
  const academyFirstRenderKey = cacheKeys.academyOverview(resolveInitialAcademySectionKey(stored));
  const oldPrefetchKey = cacheKeys.academyOverview("default");
  const newPrefetchKey = cacheKeys.academyOverview(resolveInitialAcademySectionKey(stored));
  assert.notEqual(oldPrefetchKey, academyFirstRenderKey);
  assert.equal(newPrefetchKey, academyFirstRenderKey);
  assert.equal(academyFirstRenderKey, "academy-overview:owner-1:MANAGER");
});

test("SRN-N: Team — with the managed-clubs list already cached (one club) and no explicit pick, the FIRST render resolves the club, so the roster key is the same one the previous visit populated (the old effect left it null -> skeleton)", () => {
  setOwnerKey("owner-1");
  const clubs = [{ id: "club-1", name: "Клуб 1", cityId: "city-1", cityName: "Город" }];
  const effective = resolveTeamSelectedClubId({ explicitChoice: null, clubs });
  assert.equal(effective, "club-1");
  const { activeClubId, isReadOnlyDrillDown } = resolveTeamAccessMode({ isPreviewing: false, explicitClubId: null, selectedClubId: effective });
  assert.equal(activeClubId, "club-1");
  assert.equal(isReadOnlyDrillDown, false);
  // /team keys its roster on `explicitClubId ?? effectiveClubId`; with no
  // explicit drill-down that is `effective` itself.
  assert.equal(cacheKeys.team(effective, false), cacheKeys.team("club-1", false));

  // What the OLD first frame computed: selectedClubId still null -> no club -> no key.
  const oldFirstFrame = resolveTeamAccessMode({ isPreviewing: false, explicitClubId: null, selectedClubId: null });
  assert.equal(oldFirstFrame.activeClubId, null);
});

test("SRN-O: Team selection rules are unchanged — an explicit pick wins; exactly one club auto-selects; zero clubs, 2+ clubs, or a list not loaded yet never guess", () => {
  const one = [{ id: "c1", name: "A", cityId: "x", cityName: null }];
  const two = [...one, { id: "c2", name: "B", cityId: "x", cityName: null }];
  assert.equal(resolveTeamSelectedClubId({ explicitChoice: "c2", clubs: two }), "c2");
  assert.equal(resolveTeamSelectedClubId({ explicitChoice: null, clubs: one }), "c1");
  assert.equal(resolveTeamSelectedClubId({ explicitChoice: null, clubs: [] }), null);
  assert.equal(resolveTeamSelectedClubId({ explicitChoice: null, clubs: two }), null);
  assert.equal(resolveTeamSelectedClubId({ explicitChoice: null, clubs: undefined }), null);
});

test("SRN-P: Home — the persisted context is available synchronously, so Home's first-render key is the key its previous visit asked for (not null)", () => {
  setOwnerKey("owner-1");
  withBrowserStorage(() => {
    saveStoredContext("tg-1", { type: "CITY_MANAGER" });
    const requested = loadStoredContext("tg-1") ?? undefined;
    const firstRenderKey = cacheKeys.home({ context: requested?.type, clubId: requested?.clubId, isPreviewing: false });
    assert.equal(firstRenderKey, cacheKeys.home({ context: "CITY_MANAGER", clubId: undefined, isPreviewing: false }));
  });
});

test("SRN-Q (structural): Home and Academy read storage in lazy useState initializers (no post-paint effect, no `contextResolved` flag); Home's greeting is computed on first render; Team derives its club during render; the prefetch uses the shared Academy key derivation", () => {
  const home = read("src/app/home/page.tsx");
  assert.match(home, /useState<StoredHomeContext \| undefined>\(\s*\n\s*\(\) => loadStoredContext\(ownerKey\) \?\? undefined,\s*\n\s*\);/);
  assert.match(home, /const homeKey = isOnboarded\s*\n\s*\? cacheKeys\.home\(/);
  assert.match(home, /const \[greeting\] = useState\(computeGreeting\);/);
  assert.doesNotMatch(codeOnly(home), /contextResolved|setGreeting/);

  const academy = read("src/app/academy/page.tsx");
  assert.match(academy, /useState<string>\(\(\) => \{[\s\S]*?resolveInitialAcademySectionKey\(loadStoredContext\(ownerKey\)\)/);
  // Word boundaries: `useEffectiveNavContext` must not count as `useEffect`.
  assert.doesNotMatch(codeOnly(academy), /\buseEffect\b/);

  const team = read("src/app/team/page.tsx");
  assert.match(team, /const effectiveClubId = resolveTeamSelectedClubId\(\{ explicitChoice: selectedClubId, clubs \}\);/);
  assert.doesNotMatch(codeOnly(team), /setSelectedClubId\(selection\.club\.id\)|\buseEffect\b/);

  const prefetch = read("src/lib/client/prefetch.ts");
  assert.match(prefetch, /resolveInitialAcademySectionKey\(loadStoredContext\(storedContextOwnerKey\)\)/);
  assert.doesNotMatch(codeOnly(prefetch), /academyOverview\("default"\)/);
  assert.match(home, /prefetchPersonalDestinations\(ownerKey\)/);
});

test("SRN-R (structural): Home's \"Продолжить обучение\" card reads through the shared query cache (no private fetch-on-every-mount), under an academy-prefixed key that lesson completion's existing invalidation already covers, and that is NOT in the L2 persistence allowlist", () => {
  const card = read("src/components/home/ContinueLearningCard.tsx");
  assert.match(card, /useQuery\(\s*\n\s*cacheKeys\.academyState\("MANAGER"\),\s*\n\s*\(\) => fetchAcademyState\("MANAGER"\),/);
  assert.doesNotMatch(codeOnly(card), /\buseEffect\b/);
  setOwnerKey("owner-1");
  assert.ok(cacheKeys.academyState("MANAGER").startsWith("academy"), "covered by invalidatePrefix(cacheKeyPrefixes.academy)");
  const policy = read("src/lib/client/persistent-cache-core.ts");
  assert.doesNotMatch(policy, /"academy-state"/);
});

/* ===================================================================== *
 *  4. Same-route tap — a true no-op (REAL handler logic)
 * ===================================================================== */

test("SRN-S: isSameRouteNavTap is EXACT-route only — a prefix-active tab (\"Команда\" on /team/employee) is still a real navigation back to its root", () => {
  assert.equal(isSameRouteNavTap("/academy", "/academy"), true);
  assert.equal(isSameRouteNavTap("/team/employee", "/team"), false);
  assert.equal(isSameRouteNavTap("/home", "/academy"), false);
});

test("SRN-T: applyNavTap — tapping the route already on screen calls preventDefault() and fires no selection haptic; any other tap does not prevent navigation and fires the haptic exactly once", () => {
  let prevented = 0;
  let haptics = 0;
  const event = {
    preventDefault: () => {
      prevented += 1;
    },
  };
  applyNavTap(event, true, () => {
    haptics += 1;
  });
  assert.equal(prevented, 1);
  assert.equal(haptics, 0);

  applyNavTap(event, false, () => {
    haptics += 1;
  });
  assert.equal(prevented, 1, "a different route is never prevented");
  assert.equal(haptics, 1);
});

test("SRN-U (dependency contract): the installed next/link calls our onClick FIRST, then returns before routing when e.defaultPrevented is set — so preventDefault() genuinely cancels the navigation", () => {
  const src = read("node_modules/next/dist/client/app-dir/link.js");
  const preventedIdx = src.indexOf("if (e.defaultPrevented) {");
  assert.ok(preventedIdx > 0);
  const before = src.slice(Math.max(0, preventedIdx - 600), preventedIdx);
  const after = src.slice(preventedIdx, preventedIdx + 200);
  assert.match(before, /onClick\(e\);/);
  assert.match(after, /return;[\s\S]*linkClicked\(e,/);
});

test("SRN-V (structural): every nav item routes its click through applyNavTap with the current-route flag (and marks the current tab aria-current=page)", () => {
  const src = read("src/components/bottom-navigation.tsx");
  assert.equal((src.match(/onClick=\{\(e\) => applyNavTap\(e, isCurrentRoute, hapticSelection\)\}/g) ?? []).length, 2);
  assert.match(src, /const isCurrentRoute = isSameRouteNavTap\(pathname, item\.href\);/);
  assert.equal((src.match(/aria-current=\{isCurrentRoute \? "page" : undefined\}/g) ?? []).length, 2);
});

/* ===================================================================== *
 *  5. Active tab — a pure function of the committed pathname
 * ===================================================================== */

function activeTabs(pathname: string, routes: BottomNavRoute[]): string[] {
  return routes.filter((r) => isActiveNavRoute(pathname, r)).map((r) => r.href);
}

test("SRN-X: for every role's bar, on each of its own root routes AND their known sub-routes, exactly ONE tab is active and it is the right one — the active tab has no state of its own that could lag behind the page (rapid navigation: whichever pathname commits last decides it, in the same commit as that page, because the bar is rendered inside the page)", () => {
  const sets: { name: string; routes: BottomNavRoute[]; extra: [string, string][] }[] = [
    { name: "PERSONAL", routes: BOTTOM_NAV_ROUTES, extra: [["/scripts", "/knowledge"], ["/instructions/x", "/knowledge"]] },
    { name: "CLUB_MANAGER", routes: CLUB_MANAGER_NAV_ROUTES, extra: [["/team/employee", "/team"]] },
    {
      name: "CITY_MANAGER",
      routes: CITY_MANAGER_NAV_ROUTES,
      extra: [["/city/club", "/city"], ["/city/training", "/city"], ["/questions/abc", "/questions"]],
    },
  ];
  for (const set of sets) {
    for (const r of set.routes) {
      assert.deepEqual(activeTabs(r.href, set.routes), [r.href], `${set.name}: ${r.href}`);
    }
    for (const [pathname, expected] of set.extra) {
      assert.deepEqual(activeTabs(pathname, set.routes), [expected], `${set.name}: ${pathname}`);
    }
  }
});

/* ===================================================================== *
 *  6. Ordinary navigation never touches identity / context switching
 * ===================================================================== */

/** Comments are stripped first so prose that merely MENTIONS an API can't
 * produce a false positive — only real code is checked. */
function codeOnly(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

test("SRN-Y (structural): the navigation layer (bottom nav, nav rules, root-screen entrance, motion) contains NO call to switchContext, confirmIdentity, refresh, clearAllQueries, viewAsApi, fetchMe or the bootstrap retry — a tab switch cannot trigger an identity/context transition, a cache flush or an /api/auth/me round trip", () => {
  const files = [
    "src/components/bottom-navigation.tsx",
    "src/lib/nav-items.ts",
    "src/lib/client/root-screen-entrance.ts",
    "src/lib/motion.ts",
  ];
  for (const file of files) {
    const code = codeOnly(read(file));
    assert.doesNotMatch(code, /switchContext|confirmIdentity|clearAllQueries|viewAsApi|fetchMe|retryBootstrap|\brefresh\(/, file);
  }
});

test("SRN-W (structural): the nav context is read with useSyncExternalStore over the SAME storage read + change event (subscription kept for the component's lifetime), with a null server snapshot — no null-initialised state copy", () => {
  const src = read("src/components/bottom-navigation.tsx");
  assert.match(src, /const readStoredContextType = \(\) => loadStoredContext\(getOwnerKey\(\)\)\?\.type \?\? null;/);
  assert.match(src, /const readStoredContextTypeOnServer = \(\) => null;/);
  assert.match(src, /useSyncExternalStore\(subscribeStoredContext, readStoredContextType, readStoredContextTypeOnServer\)/);
  // Word boundaries: the exported `useEffectiveNavContext` hook itself must
  // not count as a `useEffect` call.
  assert.doesNotMatch(codeOnly(src), /\buseEffect\b|\buseState\b/);
});
