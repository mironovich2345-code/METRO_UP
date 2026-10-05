"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowDown,
  ArrowLeft,
  ArrowLeftRight,
  ArrowUp,
  Award,
  BookOpen,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Eye,
  GraduationCap,
  ListChecks,
  Lock,
  MessageSquare,
  Sparkles,
  Trophy,
  UserCog,
  Users,
} from "lucide-react";
import { BottomNavigation } from "@/components/bottom-navigation";
import {
  AttentionSection,
  ManagementListRow,
  ManagementSummary,
  type AttentionItemData,
} from "@/components/management/management-primitives";
import { ThemeSwitcher } from "@/components/ui/theme-switcher";
import { Avatar } from "@/components/ui/avatar";
import { GlassCard } from "@/components/ui/glass-card";
import { SectionHeader } from "@/components/ui/section-header";
import { Button } from "@/components/ui/button";
import { XPProgress } from "@/components/ui/xp-progress";
import { RevalidatingBar } from "@/components/ui/revalidating-bar";
import { FirstRunWelcome } from "@/components/home/first-run-welcome";
import { ContinueLearningCard } from "@/components/home/ContinueLearningCard";
import { useApp } from "@/providers/app-provider";
import { useAppUser } from "@/providers/AppUserProvider";
import { getPositionById, getClubById, getCityById } from "@/content";
import { cardIn, staggerStack, springSoft } from "@/lib/motion";
import { cn, formatNumber } from "@/lib/utils";
import { pluralRu } from "@/lib/cabinet-ui";
import { fetchHome } from "@/lib/api/home-client";
import { viewAsApi } from "@/lib/api/roles-client";
import { useQuery, QUERY_POLICY } from "@/lib/client/query-cache";
import { cacheKeys } from "@/lib/client/cache-keys";
import { prefetchPersonalDestinations, prefetchCityManagerDestinations, prefetchClubManagerDestinations } from "@/lib/client/prefetch";
import { runWhenIdle } from "@/lib/client/idle";
import { useScreenPerfLog } from "@/lib/client/perf";
import { logBootEvent } from "@/lib/client/perf-boot";
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

  const [greeting, setGreeting] = useState("С возвращением");
  const [showWelcome, setShowWelcome] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);

  useEffect(() => setGreeting(computeGreeting()), []);

  useEffect(() => {
    if (hydrated && !isOnboarded) router.replace("/welcome");
  }, [hydrated, isOnboarded, router]);

  // Sprint: mini-app-context-switcher, section 8 — scoped by the Telegram
  // account id so a shared device / account switch never inherits a
  // different account's last-selected cabinet.
  const ownerKey = telegramUser?.id != null ? String(telegramUser.id) : "demo";

  // Sprint: mini-app-performance — `undefined` (not yet resolved from
  // storage) keeps the query key null (nothing fetched); once resolved it's
  // either the persisted context or "no preference" (also undefined, but
  // now a deliberate value passed to fetchHome) — resolvedRequestedContext
  // (below) tells the two apart so the key is only ever built once.
  const [requestedContext, setRequestedContext] = useState<StoredHomeContext | undefined>(undefined);
  const [contextResolved, setContextResolved] = useState(false);
  useEffect(() => {
    if (!isOnboarded) return;
    setRequestedContext(loadStoredContext(ownerKey) ?? undefined);
    setContextResolved(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnboarded]);

  const isPreviewing = Boolean(appUser?.viewContext);
  const homeKey = contextResolved
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
  useEffect(() => {
    if (dash && dash.kind !== "onboarding") {
      saveStoredContext(ownerKey, { type: dash.activeContext.type, clubId: dash.activeContext.clubId });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dash]);

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
      if (dash.kind === "full") prefetchPersonalDestinations();
      // Sprint: mini-app-cold-start, section 7 — never warm management routes
      // (team/city clubs/training) off a merely-cached, unconfirmed "kind" —
      // only once the real session has confirmed this actor genuinely holds
      // that grant right now.
      else if (dash.kind === "city_manager" && identityConfirmed) prefetchCityManagerDestinations();
      else if (dash.kind === "club_manager" && !dash.block.isPreviewing && identityConfirmed) prefetchClubManagerDestinations();
    });
  }, [dash, identityConfirmed]);

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

  return (
    <div className="relative min-h-[100dvh] pb-32">
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
              {/* Management UX Round B, section 2 — CLUB_MANAGER gets
                  "Управляющий / {club}" here instead of the personal
                  greeting/name; PERSONAL (onboarding, untouched) keeps this
                  exactly as before. Round C, section 2 — CITY_MANAGER gets
                  the same role/scope two-line treatment: "Ст. города" /
                  scopeLabel (the existing aggregate-across-grants label,
                  unchanged — no per-city picker invented here). The
                  context-switcher row below is separate and unchanged — a
                  multi-club/multi-context manager still switches there. */}
              <p className="text-xs font-medium text-muted-foreground">
                {dash && dash.kind === "club_manager"
                  ? "Управляющий"
                  : dash && dash.kind === "city_manager"
                    ? "Ст. города"
                    : `${greeting},`}
              </p>
              <h1 className="truncate text-xl font-extrabold tracking-tight text-foreground">
                {dash && dash.kind === "club_manager"
                  ? dash.block.clubLabel
                  : dash && dash.kind === "city_manager"
                    ? dash.block.scopeLabel
                    : firstName}
              </h1>
            </div>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground/50" />
          </Link>
          <ThemeSwitcher />
        </div>
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
          <div className="mt-2 pl-[60px] pr-1">
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

      <motion.main variants={staggerStack} initial="hidden" animate="show" className="flex flex-col gap-6 px-5 pt-4">
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
            <>
              {dash.block.isPreviewing && (
                <motion.div variants={cardIn}>
                  <ReturnToCityCabinetCard onReturned={() => reloadDash()} />
                </motion.div>
              )}
              <ClubManagerHomeSection block={dash.block} plan={dash.plan} router={router} />
            </>
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

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="px-1 text-sm font-bold text-foreground">{children}</p>;
}

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
 * CITY_MANAGER context body — Management UX Round C. Rebuilt on the same
 * Round A/B management primitives CLUB_MANAGER already uses (AttentionSection,
 * ManagementSummary, ManagementListRow) so Home answers "what is happening
 * in my city, and where do I need to intervene" at a glance — summary +
 * attention + entry points, not a second copy of /city's own detailed
 * workspace. Approved order: Требует внимания → Город сегодня → Клубы →
 * Обучение → Вопросы сотрудников.
 *
 * REMOVED (sections 1/9): the full "Мои клубы" list, the separate full
 * "Управляющие" list, and the oversized per-club training card — all three
 * duplicated content /city (unchanged this round) already owns in full
 * detail. Manager-assignment state now surfaces only (a) in Требует
 * внимания when a club genuinely has none (tapping it opens the EXISTING
 * /city/managers drill-down, unchanged — not a new screen), and (b) inside
 * the Клубы row's own subtitle count — never as a second full roster here.
 *
 * Only real CityManagerHomeBlockDTO fields are used — clubCount/
 * employeeCount/clubManagerCount/pendingApprovalCount/attention/training/
 * questionsNewCount/questionsUnreadCount. `training` is null, and
 * `averageProgressPercent` within it independently nullable, whenever there
 * is no published content or no one in scope yet — both render an honest
 * "—"/"Открыть обучение по клубам" rather than a fabricated 0%; a GENUINE
 * 0% (data exists, average is truly zero) still renders "0%", never
 * swallowed into the same neutral state as "no data at all".
 */
function CityManagerHomeSection({ block, router }: { block: CityManagerHomeBlockDTO; router: HomeRouter }) {
  // Home's own lean HomeAttentionItemDTO (no entityType/cityId — see
  // toHomeAttention's doc comment in cabinet-dashboards.ts) is a different
  // shape from the desktop-cabinet AttentionItemDTO /city's own
  // clubsWithoutManager helper expects, so this filters inline rather than
  // widening that shared helper's signature for one caller.
  const clubsWithoutManagerCount = block.attention.filter((a) => a.category === "CLUB_WITHOUT_CLUB_MANAGER").length;

  const attentionItems: AttentionItemData[] = [];
  if (clubsWithoutManagerCount > 0) {
    attentionItems.push({
      key: "clubs-without-manager",
      icon: UserCog,
      text: `${clubsWithoutManagerCount} ${pluralRu(clubsWithoutManagerCount, "клуб без управляющего", "клуба без управляющего", "клубов без управляющего")}`,
      onClick: () => router.push("/city/managers"),
    });
  }
  if (block.pendingApprovalCount > 0) {
    attentionItems.push({
      key: "pending-approval",
      icon: Users,
      text: `${block.pendingApprovalCount} ${pluralRu(block.pendingApprovalCount, "сотрудник ожидает подтверждения", "сотрудника ожидают подтверждения", "сотрудников ожидают подтверждения")}`,
      onClick: () => router.push("/city"),
    });
  }

  // Section 4/7 — null means "no published lessons or no one in scope yet"
  // (honest neutral state below), never conflated with a real, computed 0%.
  const averageProgressPercent = block.training?.averageProgressPercent ?? null;

  const clubsSubtitle =
    `${block.clubCount} ${pluralRu(block.clubCount, "клуб", "клуба", "клубов")} · ${block.clubManagerCount} ${pluralRu(block.clubManagerCount, "управляющий", "управляющих", "управляющих")}` +
    (clubsWithoutManagerCount > 0
      ? ` · ${clubsWithoutManagerCount} ${pluralRu(clubsWithoutManagerCount, "клуб без управляющего", "клуба без управляющего", "клубов без управляющего")}`
      : "");

  const trainingSubtitle = averageProgressPercent !== null ? `Средний прогресс ${averageProgressPercent}%` : "Открыть обучение по клубам";

  const questionsSubtitle =
    block.questionsNewCount > 0
      ? `${block.questionsNewCount} ${pluralRu(block.questionsNewCount, "новый", "новых", "новых")}`
      : "Нет новых вопросов";

  return (
    <>
      <motion.div variants={cardIn}>
        <AttentionSection items={attentionItems} />
      </motion.div>

      <motion.div variants={cardIn} className="flex flex-col gap-3">
        <SectionLabel>Город сегодня</SectionLabel>
        <ManagementSummary
          stats={[
            { key: "clubs", label: "Клубы", value: block.clubCount },
            { key: "employees", label: "Сотрудники", value: block.employeeCount },
            { key: "training", label: "Обучение", value: averageProgressPercent !== null ? `${averageProgressPercent}%` : "—" },
          ]}
        />
      </motion.div>

      <motion.div variants={cardIn}>
        <GlassCard variant="solid" pad="none" animateIn={false}>
          <ManagementListRow icon={Building2} title="Клубы" subtitle={clubsSubtitle} onClick={() => router.push("/city")} />
        </GlassCard>
      </motion.div>

      <motion.div variants={cardIn}>
        <GlassCard variant="solid" pad="none" animateIn={false}>
          <ManagementListRow icon={GraduationCap} title="Обучение" subtitle={trainingSubtitle} onClick={() => router.push("/city/training")} />
        </GlassCard>
      </motion.div>

      <motion.div variants={cardIn}>
        <GlassCard variant="solid" pad="none" animateIn={false}>
          {/* METRO UP ROUND 1, Milestone 4, section 9 — the unread-notification
              badge is ADDITIVE to the existing business count (questionsNewCount,
              in the subtitle, unchanged semantics) — never a replacement for it.
              Round C, section 8 — kept deliberately subtle (neutral bg-muted,
              not the brand/yellow this round reserves for genuine attention). */}
          <ManagementListRow
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
        </GlassCard>
      </motion.div>
    </>
  );
}

/**
 * Sprint: manual-test-round-2, section 3 — a CITY_MANAGER previewing a club
 * as CLUB_MANAGER (via /city/club's "Посмотреть кабинет Управляющего") gets
 * a clearly visible, explicitly-worded return action right on Home itself,
 * on top of the global ViewAsBanner's generic "Выйти из режима просмотра".
 * Ends the EXISTING View As session (viewAsApi.end — no new mechanism) and
 * reloads Home, which naturally resolves back to the real actor's own
 * context once the preview is gone.
 */
function ReturnToCityCabinetCard({ onReturned }: { onReturned: () => void }) {
  // Management UX Round B.1, section 2 (P0/P1 fix) — root cause of the
  // stale-nav bug's OTHER half: viewAsApi.end() already flushes the SWR
  // query cache (so Home's own /api/home refetch correctly returns
  // city_manager data), but nothing previously refreshed AppUserProvider's
  // SEPARATE, plain-React-state `user.viewContext` — it is not part of the
  // SWR cache at all, so clearing that cache never touched it. Left
  // uncorrected, `user.viewContext.previewRole` stayed "CLUB_MANAGER",
  // which resolveEffectiveNavContext checks and overrides on — before it
  // even looks at the (by-then-correct) stored context — so the nav stayed
  // wrong regardless of anything storage-side. refreshAppUser() is the
  // SAME call the global ViewAsBanner's own "Выйти из режима просмотра"
  // already makes after ending a preview (see AppShellFrame's `onEnded`) —
  // this card was simply missing it.
  const { refresh: refreshAppUser } = useAppUser();
  const [ending, setEnding] = useState(false);
  const end = async () => {
    setEnding(true);
    try {
      await viewAsApi.end();
      await refreshAppUser();
    } finally {
      onReturned();
    }
  };
  return (
    <GlassCard variant="solid" pad="md" animateIn={false} className="border border-brand/25 bg-brand/[0.06]">
      {/* Stacked, not a single row — "Вернуться к кабинету Ст. города" is long
          enough (with Button's whitespace-nowrap) to overflow a 320px screen
          if it shared a row with the icon + label (section 7's mobile pass). */}
      <div className="flex items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-2xl bg-brand/12">
          <ArrowLeft className="size-4.5 text-brand" />
        </span>
        <p className="min-w-0 flex-1 text-sm text-muted-foreground">Вы просматриваете клуб как Управляющий</p>
      </div>
      <Button size="sm" variant="secondary" block className="mt-3" onClick={end} disabled={ending}>
        {ending ? "…" : "Вернуться к кабинету Ст. города"}
      </Button>
    </GlassCard>
  );
}

/**
 * CLUB_MANAGER context body — Management UX Round B. Rebuilt on the Round
 * A management primitives (AttentionSection, ManagementListRow); approved
 * order: Требует внимания → План на сегодня → Команда → Обучение команды.
 * `plan` now renders INSIDE this section (moved out of the caller, which
 * used to render it unconditionally first) so the approved order is one
 * real ordered sequence, attention genuinely first — not "Plan always
 * first, then whatever this section has."
 *
 * "Мой клуб" is REMOVED (section 1) — audited and confirmed there is no
 * distinct, useful club-level destination or content behind it today
 * beyond what Team/Plan/Training already surface; no empty page was built
 * to preserve the card. It returns once a real club-level indicator
 * (Operations Plan / Mystery Shopper / club indicators) exists.
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
  const attentionItems: AttentionItemData[] =
    block.attention.length > 0
      ? [
          {
            key: "pending-approval",
            icon: Users,
            text: `${block.attention.length} ${pluralRu(block.attention.length, "сотрудник ожидает подтверждения", "сотрудника ожидают подтверждения", "сотрудников ожидают подтверждения")}`,
            onClick: () => router.push("/team"),
          },
        ]
      : [];

  // Section 4 — the EXISTING Daily Plan, never a future business plan.
  const planRatio = plan.total > 0 ? plan.completed / plan.total : 0;

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

  const teamSubtitle =
    `${block.employeeCount} ${pluralRu(block.employeeCount, "сотрудник", "сотрудника", "сотрудников")}` +
    (block.pendingApprovalCount > 0
      ? ` · ${block.pendingApprovalCount} ${pluralRu(block.pendingApprovalCount, "ждёт подтверждения", "ждут подтверждения", "ждут подтверждения")}`
      : "");

  return (
    <>
      <motion.div variants={cardIn}>
        <AttentionSection items={attentionItems} />
      </motion.div>

      <motion.div variants={cardIn} className="flex flex-col gap-3">
        <SectionHeader title="План на сегодня" />
        <GlassCard variant="solid" pad="md" animateIn={false} interactive onClick={() => router.push("/plan")}>
          <div className="flex items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-2xl bg-muted">
              <ListChecks className="size-4.5 text-muted-foreground" />
            </span>
            <p className="min-w-0 flex-1 truncate font-semibold">{plan.total === 0 ? "Задач нет" : `${plan.completed} из ${plan.total}`}</p>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground/50" />
          </div>
          {plan.total > 0 && (
            <div className="mt-3">
              <XPProgress value={planRatio} size="md" />
            </div>
          )}
        </GlassCard>
      </motion.div>

      <motion.div variants={cardIn}>
        <GlassCard variant="solid" pad="none" animateIn={false}>
          <ManagementListRow icon={Users} title="Команда" subtitle={teamSubtitle} onClick={() => router.push("/team")} />
        </GlassCard>
      </motion.div>

      <motion.div variants={cardIn}>
        <GlassCard variant="solid" pad="none" animateIn={false}>
          <ManagementListRow icon={GraduationCap} title="Обучение команды" subtitle={trainingSubtitle} onClick={() => router.push("/team")} />
        </GlassCard>
      </motion.div>
    </>
  );
}
