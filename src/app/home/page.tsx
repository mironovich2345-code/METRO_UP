"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  Award,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Eye,
  GraduationCap,
  ListChecks,
  Lock,
  MessageSquare,
  Search,
  Sparkles,
  Trophy,
  UserCog,
  Users,
} from "lucide-react";
import { BottomNavigation } from "@/components/bottom-navigation";
import { BOTTOM_NAV_CLEARANCE_CLASS } from "@/lib/bottom-nav-clearance";
import {
  AttentionSection,
  ManagementListRow,
  type AttentionItemData,
} from "@/components/management/management-primitives";
import {
  DashboardSection,
  ManagementLinkGroup,
  ManagementScope,
  TeamSummaryCard,
  TerritoryClubList,
  TerritoryOverviewCard,
  TodayCard,
} from "@/components/management/management-dashboard";
import { ThemeSwitcher } from "@/components/ui/theme-switcher";
import { Avatar } from "@/components/ui/avatar";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { XPProgress } from "@/components/ui/xp-progress";
import { RevalidatingBar } from "@/components/ui/revalidating-bar";
import { FirstRunWelcome } from "@/components/home/first-run-welcome";
import { ContinueLearningCard } from "@/components/home/ContinueLearningCard";
import { useApp } from "@/providers/app-provider";
import { useAppUser } from "@/providers/AppUserProvider";
import { getPositionById, getClubById, getCityById, getCityByClubId } from "@/content";
import { cardIn, staggerStack, springSoft } from "@/lib/motion";
import { cn, formatNumber } from "@/lib/utils";
import { pluralRu } from "@/lib/cabinet-ui";
import {
  attentionClubNames,
  cityOverview,
  listNames,
  managementIdentity,
  pendingEmployeeNames,
  summarizeToday,
  territoryClubs,
} from "@/lib/management-home";
import { fetchHome } from "@/lib/api/home-client";
import { useQuery, QUERY_POLICY } from "@/lib/client/query-cache";
import { cacheKeys } from "@/lib/client/cache-keys";
import { prefetchPersonalDestinations, prefetchCityManagerDestinations, prefetchClubManagerDestinations } from "@/lib/client/prefetch";
import { runWhenIdle } from "@/lib/client/idle";
import { useScreenPerfLog } from "@/lib/client/perf";
import { logBootEvent } from "@/lib/client/perf-boot";
import { useRootScreenEntrance } from "@/lib/client/root-screen-entrance";
import { loadStoredContext, saveStoredContext, type StoredHomeContext } from "@/lib/home-context-storage";
import type {
  CityManagerHomeBlockDTO,
  ClubManagerHomeBlockDTO,
  DailyTaskDTO,
  HomeContextDTO,
  HomeDashboardDTO,
  MysterySummaryDTO,
  OnboardingHomeDTO,
  RatingSummaryDTO,
} from "@/lib/api/home-types";

const WELCOME_SEEN_KEY = "metro.home.welcomed";

function computeGreeting() {
  const h = new Date().getHours();
  if (h < 6) return "Доброй ночи";
  if (h < 12) return "Доброе утро";
  if (h < 18) return "Добрый день";
  return "Добрый вечер";
}

export default function HomeScreen() {
  const { profile, isOnboarded, hydrated, identityConfirmed, telegramUser } = useApp();
  const { user: appUser } = useAppUser();
  const router = useRouter();

  // Sprint: LIVE QA FIX QA-01B — computed on the first render (lazy
  // initializer), not swapped in by a post-paint effect: the old
  // "С возвращением" -> "Добрый день" swap repainted the header text on
  // every single Home visit. Safe to read the clock here: Home only ever
  // renders client-side, behind EmployeeBootGate (whose server render is
  // always its own loader), so there is no server/hydration pass to mismatch.
  const [greeting] = useState(computeGreeting);
  const [showWelcome, setShowWelcome] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const entranceInitial = useRootScreenEntrance();

  useEffect(() => {
    if (hydrated && !isOnboarded) router.replace("/welcome");
  }, [hydrated, isOnboarded, router]);

  // Sprint: mini-app-context-switcher, section 8 — scoped by the Telegram
  // account id so a shared device / account switch never inherits a
  // different account's last-selected cabinet.
  const ownerKey = telegramUser?.id != null ? String(telegramUser.id) : "demo";

  // Sprint: mini-app-performance — the persisted context (or "no
  // preference", undefined) is what fetchHome is asked for and what the
  // cache key embeds.
  //
  // Sprint: LIVE QA FIX QA-01B — read SYNCHRONOUSLY on the first render (a
  // lazy initializer) instead of in a post-paint effect that also had to
  // flip a separate `contextResolved` flag. That effect meant every Home
  // mount rendered its first frame with a NULL SWR key — so a skeleton, and
  // a PERSONAL greeting header even for a CITY_MANAGER/CLUB_MANAGER — before
  // the (already cached) dashboard could appear one frame later: the
  // skeleton/header flash seen on every return to Home. Still read exactly
  // once per mount, never re-keyed by Home's own later saveStoredContext
  // write; same client-only reasoning as `greeting` above. The key stays
  // null until onboarding is complete, exactly as the old effect's guard did.
  const [requestedContext, setRequestedContext] = useState<StoredHomeContext | undefined>(
    () => loadStoredContext(ownerKey) ?? undefined,
  );

  const isPreviewing = Boolean(appUser?.viewContext);
  const homeKey = isOnboarded
    ? cacheKeys.home({
        context: requestedContext?.type,
        clubId: requestedContext?.clubId,
        isPreviewing,
        previewRole: appUser?.viewContext?.previewRole,
      })
    : null;
  const {
    data: dash,
    error: dashError,
    isLoading: dashLoading,
    isValidating: dashValidating,
    mutate: reloadDash,
  } = useQuery(homeKey, () => fetchHome(requestedContext), QUERY_POLICY.MUTABLE);
  const dashStatus: "loading" | "ready" | "error" = dashError ? "error" : dash ? "ready" : "loading";
  useScreenPerfLog("home", dashStatus === "ready", dashLoading);

  // Sprint: mini-app-cold-start, section 2 — the two boot-trace events that
  // distinguish "the persisted cache actually made this instant" from "this
  // was a genuine cold fetch," the same cache-hit derivation useScreenPerfLog
  // already uses (isLoading never observed true before the first ready render).
  const everDashLoading = useRef(false);
  if (dashLoading) everDashLoading.current = true;
  const dashRenderLogged = useRef(false);
  useEffect(() => {
    if (dashRenderLogged.current || dashStatus !== "ready") return;
    dashRenderLogged.current = true;
    logBootEvent(everDashLoading.current ? "home_first_fresh_render" : "home_first_cached_render");
  }, [dashStatus]);

  // Persist exactly what the server resolved — never a client guess — so a
  // revoked/invalid persisted context self-corrects (section 9).
  //
  // Sprint: LIVE QA FIX QA-01, section 10 — traced an independently-stale
  // source bottom-nav's own fallback (useEffectiveNavContext's `storedType`,
  // bottom-navigation.tsx) can read from: this effect used to save
  // `dash.activeContext` unconditionally, INCLUDING while a View-As preview
  // is active, so a CITY_MANAGER previewing CLUB_MANAGER had their own real
  // "last context" silently overwritten with the PREVIEWED one. That alone
  // was harmless while the preview was active (previewRole takes priority
  // over storedType in resolveEffectiveNavContext regardless), but the
  // INSTANT the preview ended, previewRole became null and the nav fell
  // back to storedType — which was now wrong until Home's own NEXT (real)
  // dash resolved and re-saved it, exactly the kind of "bottom nav lags
  // behind the real identity for one fetch" gap this round's "one source
  // of truth" requirement calls out. A preview's own activeContext is
  // never the real actor's own context to begin with, so it must never be
  // persisted as one — skipping the save while previewing leaves the
  // LAST genuinely-real value in place, which is already correct the
  // instant the preview ends (no window where it's wrong at all).
  useEffect(() => {
    if (dash && dash.kind !== "onboarding" && !isPreviewing) {
      saveStoredContext(ownerKey, { type: dash.activeContext.type, clubId: dash.activeContext.clubId });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dash, isPreviewing]);

  // Sprint: mini-app-performance, section 8 — warm the cache for the
  // destinations this context's own bottom-nav/cards point at, right after
  // Home's own render has what it needs. Never blocks Home (fire-and-forget,
  // scheduled via useEffect — after paint, not during it); never touches
  // preview/personal boundaries (each dash.kind gets only ITS OWN likely
  // destinations, matching section 7's "no mixed dashboards" spirit).
  //
  // Sprint: mini-app-server-startup, section 6 — runWhenIdle defers the
  // actual network calls to the next main-thread-idle window instead of
  // firing them synchronously the instant `dash` resolves. On a cold
  // reopen, `dash` often arrives WHILE other startup work (identity
  // confirmation, this same screen's own hydration) is still settling —
  // every Postgres round trip measured on Railway so far has cost
  // 70-700ms+, so 2-3 extra concurrent requests right at that moment is
  // real, avoidable contention for the same connection pool/server
  // capacity a user's own next tap would need. Deferring costs nothing: the
  // destinations these warm are "likely next", never "needed now".
  useEffect(() => {
    if (!dash) return;
    runWhenIdle(() => {
      if (dash.kind === "full") prefetchPersonalDestinations(ownerKey);
      // Sprint: mini-app-cold-start, section 7 — never warm management routes
      // (team/city clubs/training) off a merely-cached, unconfirmed "kind" —
      // only once the real session has confirmed this actor genuinely holds
      // that grant right now.
      else if (dash.kind === "city_manager" && identityConfirmed) prefetchCityManagerDestinations();
      else if (dash.kind === "club_manager" && !dash.block.isPreviewing && identityConfirmed) prefetchClubManagerDestinations();
    });
  }, [dash, identityConfirmed, ownerKey]);

  const switchContext = (ctx: HomeContextDTO) => {
    setSwitcherOpen(false);
    setRequestedContext({ type: ctx.type, clubId: ctx.clubId });
  };

  useEffect(() => {
    if (!isOnboarded) return;
    try {
      const wants = new URLSearchParams(window.location.search).get("welcome") === "1";
      const seen = localStorage.getItem(WELCOME_SEEN_KEY) === "1";
      if (wants && !seen) setShowWelcome(true);
    } catch {
      /* noop */
    }
  }, [isOnboarded]);

  const dismissWelcome = () => {
    setShowWelcome(false);
    try {
      localStorage.setItem(WELCOME_SEEN_KEY, "1");
      window.history.replaceState({}, "", "/home");
    } catch {
      /* noop */
    }
  };

  if (!hydrated || !profile) {
    return <div className="min-h-[100dvh]" />;
  }

  const firstName = profile.displayName.split(" ")[0];
  const personalIdentity = [
    getPositionById(profile.positionId)?.title,
    getClubById(profile.clubId)?.name,
    getCityById(profile.cityId)?.name,
  ]
    .filter(Boolean)
    .join(" · ");

  // Sprint: mini-app-context-switcher, section 13 — View As is a SEPARATE
  // mechanism; while a preview is active the switcher never renders (the
  // server also returns availableContexts:[] in that case, so this is
  // belt-and-suspenders, not the only guard). (isPreviewing itself is
  // declared earlier, above the useQuery call it also feeds as a cache-key
  // input.)
  const availableContexts = dash && dash.kind !== "onboarding" ? dash.availableContexts : [];
  const activeContext = dash && dash.kind !== "onboarding" ? dash.activeContext : null;
  const showSwitcher = !isPreviewing && availableContexts.length > 1;
  // Section 4: PERSONAL's header stays the original position/club/city line,
  // not the generic "Личный кабинет" switcher-list label — only the tap
  // affordance is new. Management contexts show their own scope/club label.
  const contextLabel = dash?.kind === "full" ? personalIdentity : (activeContext?.label ?? null);
  // Round D, section 0 — CLUB_MANAGER/CITY_MANAGER already repeat this exact
  // label as the header's own role/scope two lines (Round B/C); PERSONAL's
  // personalIdentity line is NOT a duplicate of anything in its header
  // (which shows the personal greeting, not position/club/city) and stays.
  const isManagementKind = dash?.kind === "city_manager" || dash?.kind === "club_manager";
  // Sprint: LIVE QA QA-03 — a management Home's identity: the greeting with
  // the person's own name, the role, and the scope (club / territory) shown
  // large under the greeting row. null for PERSONAL/onboarding, whose header
  // is unchanged. Read straight from the dash this render already has, so a
  // cached revisit paints it on its first frame (no QA-01B header swap).
  const management = managementIdentity(dash, {
    greeting,
    firstName,
    cityNameForClub: (clubId) => getCityByClubId(clubId)?.name ?? null,
  });

  return (
    <div className={`relative min-h-[100dvh] ${BOTTOM_NAV_CLEARANCE_CLASS}`}>
      <header className="brand-aura px-5 pb-2 pt-[calc(env(safe-area-inset-top)+16px)]">
        <div className="flex items-center gap-3">
          {/* User block → Profile (Profile is no longer a bottom-nav tab). Large
              tap zone; a subtle chevron signals it's interactive. */}
          <Link
            href="/profile"
            aria-label="Открыть профиль"
            className="-m-1 flex min-w-0 flex-1 items-center gap-3 rounded-2xl p-1 transition-colors active:bg-foreground/5"
          >
            {/* METRO UP ROUND 1, Milestone 1 — the custom uploaded avatar
                only (never telegramUser.photoUrl as a fallback); tapping
                already routes to /profile where it can be changed. */}
            <Avatar name={profile.displayName} src={appUser?.avatarUrl ?? undefined} size={48} ring />
            <div className="min-w-0 flex-1">
              {/* Management UX Round B/C gave CLUB_MANAGER/CITY_MANAGER a
                  role/scope pair here. Sprint: LIVE QA QA-03 — it is now
                  the greeting with the person's name over the role
                  ("Управляющий" / "Ст. города"); the scope itself (club /
                  territory, the existing aggregate-across-grants label) moved
                  out of this truncated line into the large ManagementScope
                  title below, so a long club or city name is never cut.
                  PERSONAL/onboarding keep greeting + name exactly as before.
                  The context-switcher row below is separate and unchanged — a
                  multi-club/multi-context manager still switches there. */}
              {management ? (
                <>
                  {/* Wraps (max two lines) rather than truncating: the name
                      in "Добрый день, Иван" must survive a 320px row. */}
                  <p className="line-clamp-2 text-[15px] font-semibold leading-snug text-foreground [overflow-wrap:anywhere]">
                    {management.greeting}
                  </p>
                  <p className="truncate text-xs font-medium text-muted-foreground">{management.roleLabel}</p>
                </>
              ) : (
                <>
                  <p className="text-xs font-medium text-muted-foreground">{`${greeting},`}</p>
                  <h1 className="truncate text-xl font-extrabold tracking-tight text-foreground">{firstName}</h1>
                </>
              )}
            </div>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground/50" />
          </Link>
          <ThemeSwitcher />
        </div>
        {management?.scopeTitle && <ManagementScope title={management.scopeTitle} meta={management.scopeMeta} />}
        {/* Management UX Round D, section 0 — the header above is now the
            source of truth for "who/where am I" (role/scope, or the personal
            greeting). This row's OLD job — repeating that same context as a
            full label, either as a button or as plain text — read as the
            same information shown twice (the live report's literal A/B
            example). Its ONLY remaining job is offering a way to CHANGE
            context, so it shrinks to a compact "[ ↔ Кабинет ▾ ]" chip, and
            disappears entirely whenever there is nothing to switch TO
            (exactly one available context) or switching doesn't apply right
            now (an active View-As preview — isManagementKind only suppresses
            the OLD text fallback for management kinds; PERSONAL's own
            pre-existing position/club/city identity line, which was never a
            context-switcher duplicate to begin with, is untouched below). */}
        {showSwitcher ? (
          // QA-03 — under a management scope title the chip aligns with
          // that title; otherwise with the greeting text, as before.
          <div className={management?.scopeTitle ? "mt-3 px-1" : "mt-2 pl-[60px] pr-1"}>
            <button
              type="button"
              onClick={() => setSwitcherOpen(true)}
              aria-label="Переключить кабинет"
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground transition-colors active:bg-muted"
            >
              <ArrowLeftRight className="size-3.5 text-muted-foreground" />
              Кабинет
              <ChevronDown className="size-3.5 text-muted-foreground" />
            </button>
          </div>
        ) : (
          !isManagementKind &&
          contextLabel && <p className="mt-1.5 truncate pl-[60px] text-xs font-medium text-muted-foreground">{contextLabel}</p>
        )}
      </header>
      <RevalidatingBar show={Boolean(dash) && dashValidating} />

      <motion.main variants={staggerStack} initial={entranceInitial} animate="show" className="flex flex-col gap-6 px-5 pt-4">
        {showWelcome && (
          <motion.div variants={cardIn}>
            <FirstRunWelcome
              name={firstName}
              onStart={() => {
                dismissWelcome();
                router.push("/academy");
              }}
              onDismiss={dismissWelcome}
            />
          </motion.div>
        )}

        {dashStatus === "loading" && (
          <div className="flex flex-col gap-4">
            <div className="h-32 animate-pulse rounded-3xl bg-muted" />
            <div className="h-24 animate-pulse rounded-3xl bg-muted" />
            <div className="h-24 animate-pulse rounded-3xl bg-muted" />
          </div>
        )}

        {dashStatus === "error" && (
          <GlassCard variant="solid" pad="lg" animateIn={false} className="text-center">
            <p className="font-semibold">Не удалось загрузить данные</p>
            <Button className="mt-4" variant="secondary" onClick={() => reloadDash()}>Повторить</Button>
          </GlassCard>
        )}

        {dashStatus === "ready" && dash && dash.kind === "onboarding" && (
          <OnboardingContent academy={dash.academy} onContinue={(slug) => router.push(slug ? `/academy/lesson/${slug}` : "/academy")} />
        )}

        {/* PERSONAL — Sprint: mini-app-context-switcher, section 4: the
            pre-role-refactor MANAGER experience, unchanged, with NO
            management content mixed in.
            Sprint: manual-test-round-3, section 3 — wrapped in its own
            tighter-gapped (gap-4, was the shared gap-6) container so this
            feels like one coherent feed, matching CITY_MANAGER Home's
            rhythm, without touching the outer gap-6 that city_manager/
            club_manager/onboarding still use unchanged. Same cards, same
            order, same functionality — layout only, no business logic. */}
        {dashStatus === "ready" && dash && dash.kind === "full" && (
          <div className="flex flex-col gap-4">
            <motion.div variants={cardIn}>
              <PlanCard plan={dash.plan} onOpen={() => router.push("/plan")} />
            </motion.div>

            <motion.div variants={cardIn} className="flex flex-col gap-3">
              <p className="px-1 text-sm font-bold text-foreground">Продолжить обучение</p>
              <ContinueLearningCard />
            </motion.div>

            <motion.div variants={cardIn}>
              <GlassCard variant="solid" pad="md" animateIn={false} interactive onClick={() => router.push("/knowledge")}>
                <div className="flex items-center gap-3">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-brand/12">
                    <BookOpen className="size-5 text-brand" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">База знаний</p>
                    <p className="truncate text-xs text-muted-foreground">Скрипты и рабочие инструкции</p>
                  </div>
                  <span className="text-xs font-semibold text-brand">Открыть</span>
                </div>
              </GlassCard>
            </motion.div>

            <motion.div variants={cardIn}>
              <XpCard total={dash.xp.total} today={dash.xp.today} />
            </motion.div>

            {dash.lastAchievement && (
              <motion.div variants={cardIn}>
                <GlassCard variant="solid" pad="md" animateIn={false} interactive onClick={() => router.push("/achievements")}>
                  <div className="flex items-center gap-3">
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-brand/12">
                      <Award className="size-5 text-brand" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-muted-foreground">Последнее достижение</p>
                      <p className="truncate font-semibold">{dash.lastAchievement.title}</p>
                    </div>
                    <span className="text-xs font-semibold text-brand">Все</span>
                  </div>
                </GlassCard>
              </motion.div>
            )}

            <motion.div variants={cardIn}>
              <RatingCard rating={dash.rating} onOpen={() => router.push("/ranking")} />
            </motion.div>

            <motion.div variants={cardIn}>
              <MysteryCard mystery={dash.mystery} />
            </motion.div>
          </div>
        )}

        {/* CITY_MANAGER — Management UX Round C: rebuilt compact Home,
            management content ONLY, ends after "Вопросы сотрудников".
            Sprint: mini-app-cold-start, section 7 — a `dash` of this kind
            CAN arrive from the persisted home cache before the real session
            has confirmed the actor still holds this grant (e.g. right after
            a cold reopen, while `identityConfirmed` is still false). Never
            paint management content off that guess — show a neutral
            confirming placeholder instead; the real branch renders the
            instant confirmation lands, which races the same auth call this
            whole screen is already waiting on, so it's rarely visible. */}
        {dashStatus === "ready" && dash && dash.kind === "city_manager" && (
          identityConfirmed ? (
            <CityManagerHomeSection block={dash.block} router={router} />
          ) : (
            <ConfirmingAccessPlaceholder />
          )
        )}

        {/* CLUB_MANAGER — Management UX Round B: rebuilt on the Round A
            primitives. Требует внимания → План на сегодня → Команда →
            Обучение команды, all inside ClubManagerHomeSection now (Plan
            moved IN so the approved order — attention first — is a single
            ordered list, not "Plan always first" as before). Same
            cold-start guard as above. */}
        {dashStatus === "ready" && dash && dash.kind === "club_manager" && (
          identityConfirmed ? (
            // Sprint: LIVE QA QA-03.1 — a View-As preview has ONE exit: the
            // global ViewAsBanner. The old in-page "Вернуться к кабинету Ст.
            // города" card duplicated it and has been removed.
            <ClubManagerHomeSection block={dash.block} plan={dash.plan} router={router} />
          ) : (
            <ConfirmingAccessPlaceholder />
          )
        )}
      </motion.main>

      <BottomNavigation />

      {activeContext && (
        <ContextSwitcherSheet
          open={switcherOpen}
          contexts={availableContexts}
          active={activeContext}
          onSelect={switchContext}
          onClose={() => setSwitcherOpen(false)}
        />
      )}
    </div>
  );
}

/* --------------------------- context switcher sheet --------------------------- */

/**
 * Sprint: mini-app-context-switcher, section 2/10 — a native-feeling bottom
 * sheet, not a large intrusive switcher. Options come straight from the
 * server's availableContexts (real grants only, section 2's "only show
 * contexts the real user actually has"); selecting one just re-fetches
 * /api/home with that hint — the server is what actually decides (section 3).
 */
function ContextSwitcherSheet({
  open,
  contexts,
  active,
  onSelect,
  onClose,
}: {
  open: boolean;
  contexts: HomeContextDTO[];
  active: HomeContextDTO;
  onSelect: (ctx: HomeContextDTO) => void;
  onClose: () => void;
}) {
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50">
          <motion.div className="absolute inset-0 bg-black/45" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div
            className="absolute inset-x-0 bottom-0 rounded-t-3xl border-t border-border bg-card p-6 pb-[calc(env(safe-area-inset-bottom)+24px)]"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={springSoft}
          >
            <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-border" />
            <h2 className="text-lg font-bold">Переключить кабинет</h2>
            <div className="mt-4 flex flex-col gap-2">
              {contexts.map((c) => {
                const isActive = c.type === active.type && (c.type !== "CLUB_MANAGER" || c.clubId === active.clubId);
                return (
                  <button
                    key={`${c.type}:${c.clubId ?? ""}`}
                    type="button"
                    onClick={() => onSelect(c)}
                    className={cn(
                      "flex items-center justify-between rounded-2xl border px-4 py-3.5 text-left text-sm font-medium transition-colors",
                      isActive ? "border-brand bg-brand/10 text-foreground" : "border-border text-foreground active:bg-muted",
                    )}
                  >
                    {c.label}
                    {isActive && <CheckCircle2 className="size-4 shrink-0 text-brand" />}
                  </button>
                );
              })}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

/* --------------------------------- cards --------------------------------- */

function PlanCard({ plan, onOpen }: { plan: HomeDashboardDTO["plan"]; onOpen: () => void }) {
  const ratio = plan.total ? plan.completed / plan.total : 0;
  return (
    <GlassCard variant="solid" pad="lg" animateIn={false}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-2xl bg-brand/12">
            <ListChecks className="size-5 text-brand" />
          </span>
          <p className="font-bold">План на сегодня</p>
        </div>
        <span className="text-sm font-semibold text-muted-foreground">
          {plan.completed} из {plan.total}
        </span>
      </div>
      <div className="mt-3"><XPProgress value={ratio} size="md" /></div>

      {plan.total === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">На сегодня задач нет</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {plan.tasks.map((t) => <PlanTaskRow key={t.id} task={t} />)}
        </ul>
      )}

      <Button className="mt-4" variant="secondary" block onClick={onOpen}>
        Открыть план
      </Button>
    </GlassCard>
  );
}

function PlanTaskRow({ task }: { task: DailyTaskDTO }) {
  const done = task.status === "COMPLETED";
  const skipped = task.status === "SKIPPED";
  const checkDone = task.checklist.filter((c) => c.done).length;
  return (
    <li className="flex items-center gap-2.5 text-[15px]">
      {done ? (
        <CheckCircle2 className="size-4.5 shrink-0 text-success" />
      ) : task.mode === "blocked" ? (
        <Lock className="size-4 shrink-0 text-muted-foreground" />
      ) : (
        <Circle className="size-4.5 shrink-0 text-muted-foreground" />
      )}
      <span className={cn("min-w-0 flex-1 truncate", (done || skipped) && "text-muted-foreground line-through")}>{task.title}</span>
      {task.priority === "HIGH" && !done && <span className="shrink-0 rounded-full bg-brand/12 px-1.5 py-0.5 text-[10px] font-bold text-brand">Приоритет</span>}
      {task.timeHint && !done && <span className="shrink-0 text-[11px] text-muted-foreground">{task.timeHint}</span>}
      {task.checklist.length > 0 && !done && <span className="shrink-0 text-[11px] font-semibold text-muted-foreground">{checkDone}/{task.checklist.length}</span>}
    </li>
  );
}

function XpCard({ total, today }: { total: number; today: number }) {
  return (
    <GlassCard variant="brand" pad="lg" animateIn={false}>
      <div className="flex items-center gap-2">
        <Sparkles className="size-5 text-brand-foreground" />
        <p className="font-bold text-brand-foreground">Твой опыт</p>
      </div>
      <p className="mt-2 text-3xl font-extrabold text-brand-foreground">{formatNumber(total)} XP</p>
      <p className="mt-1 text-sm text-brand-foreground/80">
        {today > 0 ? `Сегодня: +${today} XP` : "Сегодня пока без новых XP"}
      </p>
    </GlassCard>
  );
}

function DeltaBadge({ delta }: { delta: number | null | undefined }) {
  if (delta == null || delta === 0) return null;
  const up = delta > 0;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs font-semibold", up ? "text-success" : "text-red-500")}>
      {up ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
      {Math.abs(delta)}
    </span>
  );
}

function RatingCard({ rating, onOpen }: { rating: RatingSummaryDTO; onOpen: () => void }) {
  return (
    <GlassCard variant="solid" pad="lg" animateIn={false} interactive onClick={onOpen}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-2xl bg-brand/12">
            <Trophy className="size-5 text-brand" />
          </span>
          <p className="font-bold">Рейтинг</p>
        </div>
        <ChevronRight className="size-5 text-muted-foreground" />
      </div>
      {!rating.hasData ? (
        <div className="mt-2">
          <p className="text-sm font-semibold">Рейтинг пока не сформирован</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Здесь появятся результаты после публикации первого рейтинга.
          </p>
        </div>
      ) : rating.rank == null ? (
        <p className="mt-2 text-sm text-muted-foreground">
          {rating.periodLabel} · ты пока не в опубликованном рейтинге
        </p>
      ) : (
        <div className="mt-2 flex items-end justify-between">
          <div>
            <p className="text-xs text-muted-foreground">{rating.periodLabel}</p>
            <p className="text-2xl font-extrabold">{rating.rank} место</p>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold">{rating.finalScore?.toFixed(1)}</p>
            <DeltaBadge delta={rating.delta} />
          </div>
        </div>
      )}
    </GlassCard>
  );
}

function MysteryCard({ mystery }: { mystery: MysterySummaryDTO }) {
  return (
    <GlassCard variant="solid" pad="lg" animateIn={false}>
      <div className="flex items-center gap-2">
        <span className="flex size-9 items-center justify-center rounded-2xl bg-brand/12">
          <Eye className="size-5 text-brand" />
        </span>
        <p className="font-bold">Тайный покупатель</p>
      </div>
      {!mystery.hasData ? (
        <div className="mt-2">
          <p className="text-sm font-semibold">Результат появится после первой проверки</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Здесь ты увидишь итоговый балл и обратную связь.
          </p>
        </div>
      ) : (
        <div className="mt-2">
          <div className="flex items-end justify-between">
            <p className="text-xs text-muted-foreground">{mystery.periodLabel}</p>
            <p className="text-3xl font-extrabold text-foreground">{mystery.score}</p>
          </div>
          {mystery.comment && <p className="mt-2 text-sm text-muted-foreground">{mystery.comment}</p>}
        </div>
      )}
    </GlassCard>
  );
}

/* ------------------------- onboarding (PENDING_APPROVAL) ------------------------ */

/**
 * Sprint: mini-app-role-experience, section 2 — replaces the old
 * PendingApprovalScreen dead-end. Exact approved copy: the status banner and
 * course card are the only content a PENDING_APPROVAL user sees on Главная —
 * no Metric/rating/knowledge-base/Daily Plan/management data exists on
 * OnboardingHomeDTO at all, so there's nothing here that could leak it.
 */
function OnboardingContent({
  academy,
  onContinue,
}: {
  academy: OnboardingHomeDTO["academy"];
  onContinue: (slug: string | null) => void;
}) {
  return (
    <>
      <motion.div variants={cardIn}>
        <GlassCard variant="solid" pad="lg" animateIn={false} className="border border-brand/25 bg-brand/[0.07]">
          <div className="flex items-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-2xl bg-brand/15">
              <Lock className="size-5 text-brand" />
            </span>
            <p className="font-bold">Доступ пока ограничен</p>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Сейчас вам доступно вводное обучение. Полный доступ к Metro UP откроется после подтверждения руководителем.
          </p>
        </GlassCard>
      </motion.div>

      <motion.div variants={cardIn} className="flex flex-col gap-3">
        <p className="px-1 text-sm font-bold text-foreground">Знакомство с MetroFitness</p>
        {academy ? (
          <GlassCard variant="solid" pad="lg" animateIn={false}>
            <div className="flex items-center gap-2">
              <span className="flex size-9 items-center justify-center rounded-2xl bg-brand/12">
                <GraduationCap className="size-5 text-brand" />
              </span>
              <p className="font-bold">{academy.courseTitle}</p>
            </div>
            <div className="mt-3">
              <XPProgress value={academy.total ? academy.completed / academy.total : 0} size="md" />
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {academy.completed} из {pluralRu(academy.total, "урока", "уроков", "уроков")}
              {academy.totalDurationMinutes > 0 && ` · ~${academy.totalDurationMinutes} мин`}
            </p>
            <Button className="mt-4" variant="secondary" block onClick={() => onContinue(academy.nextLessonSlug)}>
              Продолжить обучение
            </Button>
          </GlassCard>
        ) : (
          <GlassCard variant="solid" pad="lg" animateIn={false} className="text-center">
            <p className="font-semibold">Вводное обучение скоро появится</p>
            <p className="mt-1 text-sm text-muted-foreground">Загляните сюда чуть позже.</p>
          </GlassCard>
        )}
      </motion.div>
    </>
  );
}

/* --------------------------- management cabinet contexts --------------------------- */

type HomeRouter = { push: (href: string) => void };

/**
 * Sprint: mini-app-cold-start, section 7 — shown instead of
 * CityManagerHomeSection/ClubManagerHomeSection while `dash.kind` is a
 * management kind but the real session hasn't confirmed the grant yet (a
 * cached, speculative Home render). Deliberately says nothing that reveals
 * WHICH management role is pending confirmation — that itself is still
 * unconfirmed — and never a skeleton mimicking real management widgets.
 */
function ConfirmingAccessPlaceholder() {
  return (
    <GlassCard variant="solid" pad="lg" animateIn={false} className="flex items-center gap-3">
      <span className="flex size-9 shrink-0 animate-pulse items-center justify-center rounded-2xl bg-muted">
        <Lock className="size-4.5 text-muted-foreground" />
      </span>
      <p className="text-sm text-muted-foreground">Подтверждаем доступ…</p>
    </GlassCard>
  );
}

/**
 * CITY_MANAGER context body — "Моя территория". Management UX Round C made
 * it summary + attention + entry points, not a second copy of /city's own
 * detailed workspace. Sprint: LIVE QA QA-03 gives it a strategic hierarchy
 * of its own instead of CLUB_MANAGER's layout with different words:
 *
 *   LEVEL 1  the territory overview — clubs, employees, training average
 *   LEVEL 2  Требует внимания — every row says WHAT, WHERE (the clubs) and
 *            WHAT TO DO; then Клубы — the territory club by club
 *   LEVEL 3  Обучение · Тайный покупатель · Вопросы сотрудников
 *
 * The Клубы block is a compact territory list (name, attention marker,
 * manager, headcount, training — capped, server order), each row opening the
 * existing /city/club drill-down; /city keeps the full workspace ("Все
 * клубы"). Every attention item keeps its Round C/E1 gate and target.
 *
 * Only real CityManagerHomeBlockDTO fields are used (via
 * src/lib/management-home.ts). `training` is null, and
 * `averageProgressPercent` within it independently nullable, whenever there
 * is no published content or no one in scope yet — the overview then says
 * "Данных по обучению пока нет" instead of a fabricated 0% or "—"; a GENUINE
 * 0% (data exists, average truly zero) still renders "0%".
 */
function CityManagerHomeSection({ block, router }: { block: CityManagerHomeBlockDTO; router: HomeRouter }) {
  // Home's own lean HomeAttentionItemDTO (no entityType/cityId — see
  // toHomeAttention's doc comment in cabinet-dashboards.ts) is a different
  // shape from the desktop-cabinet AttentionItemDTO /city's own
  // clubsWithoutManager helper expects, so this filters inline rather than
  // widening that shared helper's signature for one caller.
  const clubsWithoutManagerCount = block.attention.filter((a) => a.category === "CLUB_WITHOUT_CLUB_MANAGER").length;

  // QA-03 — each row also names WHERE (the clubs, from the block's own
  // attention + club list) and WHAT TO DO; gates and targets are unchanged.
  const attentionItems: AttentionItemData[] = [];
  if (clubsWithoutManagerCount > 0) {
    attentionItems.push({
      key: "clubs-without-manager",
      icon: UserCog,
      onClick: () => router.push("/city/managers"),
      text: `${clubsWithoutManagerCount} ${pluralRu(clubsWithoutManagerCount, "клуб без управляющего", "клуба без управляющего", "клубов без управляющего")}`,
      detail: listNames(attentionClubNames(block, "CLUB_WITHOUT_CLUB_MANAGER")),
      actionLabel: "Назначить",
    });
  }
  if (block.pendingApprovalCount > 0) {
    attentionItems.push({
      key: "pending-approval",
      icon: Users,
      onClick: () => router.push("/city"),
      text: `${block.pendingApprovalCount} ${pluralRu(block.pendingApprovalCount, "сотрудник ожидает подтверждения", "сотрудника ожидают подтверждения", "сотрудников ожидают подтверждения")}`,
      detail: listNames(attentionClubNames(block, "PENDING_EMPLOYEE_APPROVAL")),
      actionLabel: "Проверить",
    });
  }
  // Management Round E1, section 16 — approved as a small, isolated
  // composition addition only: real questionsNewCount, gated strictly on
  // > 0 (never a forced zero-value row), linking to the existing /questions
  // screen. No backend/notification change — this reads the SAME field the
  // permanent "Вопросы сотрудников" row below already reads; that row
  // stays exactly as-is, this is purely additive. CLUB_MANAGER is
  // deliberately NOT given this item — its own block has no
  // questionsNewCount field/routing today (section 16's explicit scope).
  if (block.questionsNewCount > 0) {
    attentionItems.push({
      key: "new-questions",
      icon: MessageSquare,
      onClick: () => router.push("/questions"),
      text: `${block.questionsNewCount} ${pluralRu(block.questionsNewCount, "новый вопрос", "новых вопроса", "новых вопросов")}`,
      // Questions are scoped to this actor's whole territory (no per-club
      // field on Home), so WHERE is the territory itself.
      detail: block.clubCount > 0 ? block.scopeLabel : null,
      actionLabel: "Ответить",
    });
  }

  const overview = cityOverview(block);
  const territory = territoryClubs(block.clubs);

  const questionsSubtitle =
    block.questionsNewCount > 0
      ? `${block.questionsNewCount} ${pluralRu(block.questionsNewCount, "новый", "новых", "новых")}`
      : "Нет новых вопросов";

  return (
    <>
      {/* LEVEL 1 — the territory at a glance. */}
      <motion.div variants={cardIn}>
        <TerritoryOverviewCard overview={overview} />
      </motion.div>

      {/* LEVEL 2 — where intervention is needed. */}
      <motion.div variants={cardIn}>
        <AttentionSection items={attentionItems} />
      </motion.div>

      {/* LEVEL 2 — the territory club by club (/city keeps the full
          workspace). Absent when the scope has no clubs — the overview
          already says so in words. */}
      {territory.visible.length > 0 && (
        <motion.div variants={cardIn}>
          <DashboardSection title="Клубы" action={{ label: "Все клубы", onClick: () => router.push("/city") }}>
            <TerritoryClubList
              clubs={territory.visible}
              hiddenCount={territory.hiddenCount}
              onOpenClub={(clubId) => router.push(`/city/club?clubId=${clubId}`)}
              onOpenAll={() => router.push("/city")}
            />
          </DashboardSection>
        </motion.div>
      )}

      {/* LEVEL 3 — supporting entry points. Обучение names its destination
          instead of repeating the overview's average. Management Round E3:
          Тайный покупатель is a compact entry into its workspace — no live
          count fetched here, and no clubId (the CITY_MANAGER root scope,
          every club their grants cover). */}
      <motion.div variants={cardIn}>
        <ManagementLinkGroup>
          <ManagementListRow wrapTitle icon={GraduationCap} title="Обучение" subtitle="Прогресс по клубам" onClick={() => router.push("/city/training")} />
          <ManagementListRow wrapTitle icon={Search} title="Тайный покупатель" subtitle="Результаты по клубам" onClick={() => router.push("/mystery-shopper")} />
          {/* METRO UP ROUND 1, Milestone 4, section 9 — the unread-notification
              badge is ADDITIVE to the existing business count (questionsNewCount,
              in the subtitle, unchanged semantics) — never a replacement for it.
              Round C, section 8 — kept deliberately subtle (neutral bg-muted,
              not the brand/yellow this round reserves for genuine attention). */}
          <ManagementListRow
            wrapTitle
            icon={MessageSquare}
            title="Вопросы сотрудников"
            subtitle={questionsSubtitle}
            trailing={
              block.questionsUnreadCount > 0 ? (
                <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-muted px-1.5 text-[11px] font-bold text-muted-foreground">
                  {block.questionsUnreadCount}
                </span>
              ) : undefined
            }
            onClick={() => router.push("/questions")}
          />
        </ManagementLinkGroup>
      </motion.div>
    </>
  );
}

/**
 * CLUB_MANAGER context body — "Мой клуб", operational: "what is happening in
 * my club today, and what needs me?" Management UX Round B built it on the
 * Round A primitives as four equal rows; Sprint: LIVE QA QA-03 gives it a
 * hierarchy (the club itself is the large title in Home's header):
 *
 *   LEVEL 1  Сегодня — the EXISTING Daily Plan as the dashboard's anchor
 *   LEVEL 2  Требует внимания (who is waiting), then Команда — headcount,
 *            pending state and training in ONE summary with one way in
 *   LEVEL 3  Тайный покупатель
 *
 * The old "Мой клуб" card stays removed (Round B, section 1 — no distinct
 * club-level destination behind it). Only real ClubManagerHomeBlockDTO +
 * Daily Plan fields are used; a zero-task day keeps its dedicated empty
 * state (no "0 из 0", no empty bar). A View-As-CLUB_MANAGER preview renders
 * this exact component (see the caller) — no separate preview dashboard.
 *
 * block.clubId is always a real, single club — the context switcher (not
 * this component) disambiguates a multi-club manager, unchanged.
 */
function ClubManagerHomeSection({
  block,
  plan,
  router,
}: {
  block: ClubManagerHomeBlockDTO;
  plan: HomeDashboardDTO["plan"];
  router: HomeRouter;
}) {
  // Section 3 — only a REAL, currently-supported attention category exists
  // for CLUB_MANAGER (pending employee approval); never a fabricated
  // mystery-shopper/plan/budget item. Aggregated into one row, same as
  // before — a tap goes to the one place it can actually be acted on.
  // QA-03 — the row also says WHO is waiting (the real names in the block).
  const attentionItems: AttentionItemData[] =
    block.attention.length > 0
      ? [
          {
            key: "pending-approval",
            icon: Users,
            onClick: () => router.push("/team"),
            text: `${block.attention.length} ${pluralRu(block.attention.length, "сотрудник ожидает подтверждения", "сотрудника ожидают подтверждения", "сотрудников ожидают подтверждения")}`,
            detail: listNames(pendingEmployeeNames(block.attention)),
            actionLabel: "Проверить",
          },
        ]
      : [];

  // Section 4 — the EXISTING Daily Plan, never a future business plan.
  const today = summarizeToday(plan);

  // Section 6 — only real ClubTrainingSummaryDTO fields (totalPublishedLessons/
  // employeesInTraining/employeesCompleted); no "средний прогресс %" field
  // exists for CLUB_MANAGER (that's a CITY_MANAGER-only aggregate). Round
  // B.1, section 5 — live review found the ORIGINAL copy always forced
  // BOTH numbers in ("Завершили всё: 0 · Проходят обучение: 1"), showing a
  // zero that helps no one. Each clause now only appears when its own
  // count is genuinely > 0 — never a forced zero.
  const trainingSubtitle = (() => {
    if (!block.training || block.training.totalPublishedLessons === 0) return "Нет данных";
    const parts: string[] = [];
    if (block.training.employeesCompleted > 0) parts.push(`Завершили всё: ${block.training.employeesCompleted}`);
    if (block.training.employeesInTraining > 0) {
      parts.push(
        `${block.training.employeesInTraining} ${pluralRu(block.training.employeesInTraining, "проходит обучение", "проходят обучение", "проходят обучение")}`,
      );
    }
    return parts.length > 0 ? parts.join(" · ") : "Пока никто не начал обучение";
  })();

  return (
    <>
      {/* LEVEL 1 — today's Daily Plan, the operational anchor. */}
      <motion.div variants={cardIn}>
        <TodayCard summary={today} onOpen={() => router.push("/plan")} />
      </motion.div>

      {/* LEVEL 2 — who is waiting on this manager. */}
      <motion.div variants={cardIn}>
        <AttentionSection items={attentionItems} />
      </motion.div>

      {/* LEVEL 2 — the team (Round B's separate Команда + Обучение команды
          rows, which both opened /team) as one summary with one CTA. */}
      <motion.div variants={cardIn}>
        <TeamSummaryCard
          employeeCount={block.employeeCount}
          pendingCount={block.pendingApprovalCount}
          trainingText={trainingSubtitle}
          onOpenTeam={() => router.push("/team")}
        />
      </motion.div>

      {/* LEVEL 3 — Management Round E3: the club-level indicator Round B
          said would return once Mystery Shopper existed. block.clubId is
          always this manager's own, single club — passed explicitly so the
          shared /mystery-shopper route resolves straight to it. */}
      <motion.div variants={cardIn}>
        <ManagementLinkGroup>
          <ManagementListRow
            wrapTitle
            icon={Search}
            title="Тайный покупатель"
            subtitle="Результаты сотрудников"
            onClick={() => router.push(`/mystery-shopper?clubId=${block.clubId}`)}
          />
        </ManagementLinkGroup>
      </motion.div>
    </>
  );
}
