"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, ChevronRight, Search, Users } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { ManagementListRow, ManagementSummary } from "@/components/management/management-primitives";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { RevalidatingBar } from "@/components/ui/revalidating-bar";
import { useAppUser } from "@/providers/AppUserProvider";
import { ApiError } from "@/lib/api/client";
import { cabinetApi } from "@/lib/api/cabinet-client";
import type { ManagementMysteryShopperClubRowDTO, ManagementMysteryShopperEmployeeRowDTO, MysteryShopperPeriodDTO } from "@/lib/api/cabinet-client";
import { useQuery, QUERY_POLICY } from "@/lib/client/query-cache";
import { cacheKeys } from "@/lib/client/cache-keys";
import { pluralRu } from "@/lib/cabinet-ui";
import { cardIn, staggerStack, springSoft } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * Management Round E3 — the Mystery Shopper management workspace, shared
 * by CLUB_MANAGER (own club) and CITY_MANAGER (root scope, or a drill-down
 * into one scoped club) behind ONE route/screen (round brief section 5).
 * Every scenario the brief describes is the SAME component, rendering
 * off `data.scope.kind` — the server decides which scope applies
 * (route.ts's own doc comment); this component never guesses a role.
 *
 * `clubId` in the URL is only ever a HINT the server independently
 * re-validates (section 11/12) — a 403 here always means "foreign club or
 * revoked scope," never silently falls back to a broader view.
 *
 * NO THRESHOLD (section 4) — a score is rendered as a bare number, never
 * colored/iconed by magnitude anywhere on this screen.
 *
 * HISTORICAL ATTRIBUTION (sections 2/14) — every string here says "team"/
 * "сотрудники", never "история клуба"/"клуб всегда показывал" — see
 * mystery-shopper.ts's own header comment for the full truthfulness
 * reasoning this copy reflects.
 */
export default function MysteryShopperPage() {
  const search = useSearchParams();
  const clubIdHint = search.get("clubId");
  const router = useRouter();
  const { user } = useAppUser();
  const isPreviewing = user?.viewContext?.previewRole === "CLUB_MANAGER";

  const [period, setPeriod] = useState<{ month: number; year: number } | null>(null);
  const [periodSheetOpen, setPeriodSheetOpen] = useState(false);

  const {
    data,
    error,
    isValidating,
    mutate: reload,
  } = useQuery(
    cacheKeys.mysteryShopper(clubIdHint, period?.month ?? null, period?.year ?? null, isPreviewing),
    () => cabinetApi.mysteryShopper({ clubId: clubIdHint ?? undefined, month: period?.month, year: period?.year }),
    QUERY_POLICY.MEDIUM,
  );

  const isDenied = error instanceof ApiError && (error.status === 403 || error.status === 401);
  const isOtherError = Boolean(error) && !isDenied;

  const headerTitle = "Тайный покупатель";
  const headerSubtitle = data ? (data.scope.kind === "CLUB" ? data.scope.clubName ?? "Клуб" : data.scope.scopeLabel) : undefined;

  return (
    <div className="relative min-h-[100dvh] pb-24">
      <AppHeader title={headerTitle} subtitle={headerSubtitle} showBack showThemeSwitcher={false} />
      <RevalidatingBar show={Boolean(data) && isValidating} />

      <motion.main variants={staggerStack} initial="hidden" animate="show" className="flex flex-col gap-5 px-5 pt-2">
        {!data && !error && (
          <div className="flex flex-col gap-3">
            <div className="h-11 animate-pulse rounded-2xl bg-muted" />
            <div className="h-20 animate-pulse rounded-3xl bg-muted" />
            <div className="h-40 animate-pulse rounded-3xl bg-muted" />
          </div>
        )}

        {isDenied && (
          <GlassCard variant="solid" pad="lg" animateIn={false} className="text-center">
            <p className="font-semibold">Клуб недоступен для вашей зоны ответственности</p>
          </GlassCard>
        )}
        {isOtherError && (
          <GlassCard variant="solid" pad="lg" animateIn={false} className="text-center">
            <p className="font-semibold">Не удалось загрузить</p>
            <Button className="mt-4" variant="secondary" onClick={() => reload()}>Повторить</Button>
          </GlassCard>
        )}

        {data && (
          <>
            {data.periods.length === 0 ? (
              <motion.div variants={cardIn}>
                <GlassCard variant="solid" pad="lg" animateIn={false} className="text-center">
                  <Search className="mx-auto size-6 text-muted-foreground" />
                  <p className="mt-2 font-semibold">Результатов пока нет</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {data.scope.kind === "CLUB" ? "У сотрудников этого клуба пока нет опубликованных результатов." : "В зоне ответственности пока нет опубликованных результатов."}
                  </p>
                </GlassCard>
              </motion.div>
            ) : (
              <>
                <motion.div variants={cardIn}>
                  <PeriodSelector
                    periods={data.periods}
                    selected={data.selectedPeriod}
                    onPick={(p) => setPeriod({ month: p.month, year: p.year })}
                    open={periodSheetOpen}
                    setOpen={setPeriodSheetOpen}
                  />
                </motion.div>

                <motion.div variants={cardIn}>
                  {data.summary.resultCount > 0 ? (
                    <ManagementSummary
                      stats={[
                        { key: "avg", label: "Средний результат", value: `${data.summary.averageScore}%` },
                        { key: "count", label: "Результатов", value: data.summary.resultCount },
                      ]}
                    />
                  ) : (
                    <GlassCard variant="solid" pad="md" animateIn={false} className="text-center">
                      <p className="text-sm text-muted-foreground">За этот период результатов нет</p>
                    </GlassCard>
                  )}
                </motion.div>

                {data.scope.kind === "CLUB" && data.employees && (
                  <motion.div variants={cardIn} className="flex flex-col gap-3">
                    <p className="px-1 text-sm font-bold text-foreground">Сотрудники</p>
                    <GlassCard variant="solid" pad="none" animateIn={false} className="divide-y divide-border">
                      {data.employees.length === 0 ? (
                        <p className="p-4 text-sm text-muted-foreground">В клубе пока нет сотрудников.</p>
                      ) : (
                        data.employees.map((e) => (
                          <EmployeeRow
                            key={e.userId}
                            employee={e}
                            onClick={() => router.push(`/team/employee?userId=${e.userId}&clubId=${data.scope.kind === "CLUB" ? data.scope.clubId : ""}`)}
                          />
                        ))
                      )}
                    </GlassCard>
                  </motion.div>
                )}

                {data.scope.kind === "CITY" && data.clubs && (
                  <motion.div variants={cardIn} className="flex flex-col gap-3">
                    <p className="px-1 text-sm font-bold text-foreground">Клубы</p>
                    <GlassCard variant="solid" pad="none" animateIn={false} className="divide-y divide-border">
                      {data.clubs.length === 0 ? (
                        <p className="p-4 text-sm text-muted-foreground">Нет клубов в зоне ответственности.</p>
                      ) : (
                        data.clubs.map((c) => (
                          <ClubRow key={c.clubId} club={c} onClick={() => router.push(`/mystery-shopper?clubId=${c.clubId}`)} />
                        ))
                      )}
                    </GlassCard>
                  </motion.div>
                )}
              </>
            )}
          </>
        )}
      </motion.main>
    </div>
  );
}

/** Section 7's compact "Сентябрь 2026 ▾" control — a tap opens a bottom
 * sheet listing every REAL period in scope (never a fabricated one).
 * Non-interactive (no chevron) when there is nothing to switch to. */
function PeriodSelector({
  periods,
  selected,
  onPick,
  open,
  setOpen,
}: {
  periods: MysteryShopperPeriodDTO[];
  selected: MysteryShopperPeriodDTO | null;
  onPick: (p: MysteryShopperPeriodDTO) => void;
  open: boolean;
  setOpen: (v: boolean) => void;
}) {
  const canSwitch = periods.length > 1;
  return (
    <>
      <GlassCard
        variant="solid"
        pad="md"
        animateIn={false}
        interactive={canSwitch}
        onClick={canSwitch ? () => setOpen(true) : undefined}
        className="flex items-center justify-between"
      >
        <p className="font-semibold">{selected?.label ?? "—"}</p>
        {canSwitch && <ChevronDown className="size-4 text-muted-foreground" />}
      </GlassCard>

      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-50">
            <motion.div className="absolute inset-0 bg-black/45" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)} />
            <motion.div
              className="absolute inset-x-0 bottom-0 max-h-[70dvh] overflow-y-auto rounded-t-3xl border-t border-border bg-card p-6 pb-[calc(env(safe-area-inset-bottom)+24px)]"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={springSoft}
            >
              <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-border" />
              <h2 className="text-lg font-bold">Период</h2>
              <div className="mt-4 flex flex-col gap-2">
                {periods.map((p) => {
                  const isSelected = selected?.month === p.month && selected?.year === p.year;
                  return (
                    <button
                      key={`${p.year}-${p.month}`}
                      onClick={() => {
                        onPick(p);
                        setOpen(false);
                      }}
                      className={cn(
                        "flex items-center justify-between rounded-2xl border border-border px-4 py-3 text-left text-sm font-medium",
                        isSelected && "border-brand bg-brand/10",
                      )}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

/** Section 8 — avatar-badge/name/position, same visual convention
 * /team and /city/club's own roster rows already use (a neutral icon
 * badge, never a real photo in a management list). `score` is null for a
 * CURRENT team member with no PUBLISHED result for the selected period —
 * "Нет результата", never a fabricated 0% (section 8/20's explicit
 * instruction). No color/threshold on the number itself (section 4). */
function EmployeeRow({ employee, onClick }: { employee: ManagementMysteryShopperEmployeeRowDTO; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-3 p-4 text-left transition-colors active:bg-foreground/5">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-muted">
        <Users className="size-4.5 text-muted-foreground" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{employee.displayName}</p>
        {employee.position && <p className="truncate text-xs text-muted-foreground">{employee.position}</p>}
      </div>
      <p className="shrink-0 text-sm font-bold tabular-nums">{employee.score != null ? `${employee.score}%` : <span className="text-xs font-medium text-muted-foreground">Нет результата</span>}</p>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground/50" />
    </button>
  );
}

/** Section 9/10 — one compact row per club in a CITY_MANAGER's scope.
 * Tapping drills into that SAME page/route with ?clubId= set (section 10)
 * — never a separate screen. "Нет результатов" when this club genuinely
 * has zero PUBLISHED results for the selected period — never 0%. */
function ClubRow({ club, onClick }: { club: ManagementMysteryShopperClubRowDTO; onClick: () => void }) {
  const subtitle =
    club.summary.resultCount > 0
      ? `${club.summary.averageScore}% · ${club.summary.resultCount} ${pluralRu(club.summary.resultCount, "результат", "результата", "результатов")}`
      : "Нет результатов";
  return <ManagementListRow icon={Search} title={club.clubName} subtitle={subtitle} onClick={onClick} />;
}
