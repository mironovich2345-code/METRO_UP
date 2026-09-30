"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { CheckCircle2, ChevronRight, Clock, GraduationCap, UserCheck, Users } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { RevalidatingBar } from "@/components/ui/revalidating-bar";
import { useAppUser } from "@/providers/AppUserProvider";
import { ApiError } from "@/lib/api/client";
import { cabinetApi } from "@/lib/api/cabinet-client";
import { managerApi } from "@/lib/api/club-plan-client";
import type { CabinetTeamMemberDTO, ClubManagerDashboardDTO } from "@/lib/api/cabinet-client";
import { useQuery, QUERY_POLICY, invalidatePrefix } from "@/lib/client/query-cache";
import { cacheKeys, cacheKeyPrefixes } from "@/lib/client/cache-keys";
import { cardIn, staggerStack } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { describeRoleAssignmentError, filterPendingEmployees, resolveManagedClubSelection, resolveTeamAccessMode } from "@/lib/cabinet-ui";

/**
 * Sprint: mini-app-role-experience, section 8-9 — CLUB_MANAGER's "Моя
 * команда" Mini App screen. No new backend: the summary + roster come from
 * the SAME step-4 cabinet read model the desktop /control/city club-detail
 * screen already uses (cabinetApi.clubManager/clubManagerTeam,
 * CityManagerClubDetail.tsx), and "Подтвердить" reuses the existing manager
 * approval API (managerApi.approve, unchanged since Phase 2B) — no parallel
 * approval path. Multi-club selection reuses resolveManagedClubSelection
 * (cabinet-ui.ts, step 6) rather than guessing a club.
 *
 * Sprint: manual-test-round-3, section 1 (P0 root cause) — a CITY_MANAGER
 * drilling in from /city/club's "Открыть команда" was landing here with NO
 * clubId at all, so this page unconditionally called
 * cabinetApi.myManagedClubs() (GET /api/control/club/clubs) FIRST — a route
 * that 403s anyone who isn't themselves a CLUB_MANAGER (legacy AppRole or an
 * active grant), which a pure CITY_MANAGER is not. That 403 landed in the
 * generic .catch(() => setStatus("error")), producing "Не удалось загрузить"
 * even though the SAME club's roster loads fine elsewhere (e.g.
 * AssignManagerSheet's cabinetApi.clubManagerTeam(clubId) call, which never
 * goes through myManagedClubs at all — it's authorized per-request via
 * resolveClubManagerCabinetAccess's tier 3, club.read). Fix: this page now
 * accepts an explicit `?clubId=` — when present, it skips the self-lookup
 * entirely and reads that club directly (same tier-3 club.read authority
 * the working request already used), as a READ-ONLY drill-down (no
 * "Подтвердить" — approval is the real CLUB_MANAGER's job, and
 * requireClubManagerAccess() would 403 a pure CITY_MANAGER's approve call
 * anyway). With no clubId (the CLUB_MANAGER's own bottom-of-Home tap-through,
 * unchanged), the original self-managed-club flow applies exactly as before.
 *
 * View As: while an active View-As-CLUB_MANAGER preview is running, club
 * selection is skipped entirely — the server always resolves the exact
 * previewed club when clubId is omitted (resolveClubManagerCabinetAccess's
 * tier 1) — and the roster is read-only (dashboard.isPreviewing hides
 * "Подтвердить"; the underlying route is independently guarded server-side
 * by requireClubManagerAccess() checking the REAL actor's own grants, never
 * the preview persona, so a preview can never approve anyone regardless of
 * what this screen renders). An active preview always takes priority over
 * any `?clubId=` in the URL.
 */
export default function TeamPage() {
  const { user } = useAppUser();
  const router = useRouter();
  const search = useSearchParams();
  const explicitClubId = search.get("clubId");
  const isPreviewing = user?.viewContext?.previewRole === "CLUB_MANAGER";

  const [selectedClubId, setSelectedClubId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  // Resolve which club(s) this real actor manages — skipped while previewing
  // AND skipped entirely when an explicit clubId drill-down is given (that
  // clubId is authorized per-request, never via "clubs I manage"). MUTABLE:
  // a brand-new CLUB_MANAGER assignment must be reflected quickly.
  const { data: clubs, error: clubsError } = useQuery(
    !isPreviewing && !explicitClubId ? cacheKeys.myManagedClubs() : null,
    () => cabinetApi.myManagedClubs().then((r) => r.clubs),
    QUERY_POLICY.MUTABLE,
  );
  useEffect(() => {
    if (!clubs) return;
    const selection = resolveManagedClubSelection(clubs);
    if (selection.kind === "auto") setSelectedClubId(selection.club.id);
  }, [clubs]);

  const { isReadOnlyDrillDown, activeClubId } = resolveTeamAccessMode({ isPreviewing, explicitClubId, selectedClubId });

  const canLoad = isPreviewing || Boolean(activeClubId);
  const teamKey = canLoad ? cacheKeys.team(explicitClubId ?? selectedClubId, isPreviewing) : null;
  const {
    data: teamData,
    error: teamError,
    isValidating,
    mutate: reloadTeam,
  } = useQuery(
    teamKey,
    () =>
      Promise.all([cabinetApi.clubManager(activeClubId ?? undefined), cabinetApi.clubManagerTeam(activeClubId ?? undefined)]).then(
        ([d, t]) => ({ dashboard: d, members: t.members }),
      ),
    QUERY_POLICY.MUTABLE, // roster/pending-approval — changes from another actor's action at any time
  );
  const dashboard: ClubManagerDashboardDTO | null = teamData?.dashboard ?? null;
  const members: CabinetTeamMemberDTO[] | null = teamData?.members ?? null;

  const error = clubsError ?? teamError;
  const status: "loading" | "ready" | "error" | "no-club" | "denied" =
    error instanceof ApiError && (error.status === 403 || error.status === 401)
      ? "denied"
      : error
        ? "error"
        : clubs && resolveManagedClubSelection(clubs).kind === "none"
          ? "no-club"
          : teamData
            ? "ready"
            : "loading";

  // Sprint: manual-test-round-3, sections 5B/5C — every roster row (pending
  // and active alike) drills into the SAME shared, role-agnostic training
  // detail screen (/team/employee), scoped server-side by club.read against
  // the target employee's actual club — never trusted from this URL.
  const goToEmployeeTraining = (userId: string) => {
    const clubParam = dashboard?.clubId ? `&clubId=${dashboard.clubId}` : "";
    router.push(`/team/employee?userId=${userId}${clubParam}`);
  };

  const approve = async (userId: string) => {
    if (!dashboard?.clubId) return;
    setBusyId(userId);
    setMsg(null);
    try {
      await managerApi.approve(userId, "FULL", dashboard.clubId);
      // Section 7 — an approval changes this team's own pending count AND
      // Home's club_manager block (same numbers, summarized); a defensive
      // city:* invalidation covers the rare case this same browser is also
      // mid a CITY_MANAGER View-As of the same club.
      await reloadTeam();
      invalidatePrefix(cacheKeyPrefixes.home);
      invalidatePrefix(cacheKeyPrefixes.city);
    } catch (e) {
      setMsg(describeRoleAssignmentError(e instanceof ApiError ? e.code : null));
    } finally {
      setBusyId(null);
    }
  };

  // Multi-club, not yet chosen — a compact selector, never an arbitrary pick.
  if (!isPreviewing && clubs && clubs.length > 1 && !selectedClubId) {
    return (
      <div className="relative min-h-[100dvh] pb-24">
        <AppHeader title="Моя команда" showBack backHref="/home" showThemeSwitcher={false} />
        <main className="flex flex-col gap-3 px-5 pt-2">
          <p className="px-1 text-sm text-muted-foreground">Выберите клуб</p>
          {clubs.map((c) => (
            <GlassCard key={c.id} variant="solid" pad="md" animateIn={false} interactive onClick={() => setSelectedClubId(c.id)} className="flex items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-brand/12">
                <Users className="size-4.5 text-brand" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{c.name}</p>
                {c.cityName && <p className="truncate text-xs text-muted-foreground">{c.cityName}</p>}
              </div>
            </GlassCard>
          ))}
        </main>
      </div>
    );
  }

  return (
    <div className="relative min-h-[100dvh] pb-24">
      <AppHeader
        title={isReadOnlyDrillDown ? "Команда" : "Моя команда"}
        subtitle={dashboard?.clubName ?? undefined}
        showBack
        backHref={explicitClubId ? `/city/club?clubId=${explicitClubId}` : "/home"}
        showThemeSwitcher={false}
      />
      <RevalidatingBar show={Boolean(teamData) && isValidating} />

      <motion.main variants={staggerStack} initial="hidden" animate="show" className="flex flex-col gap-5 px-5 pt-2">
        {status === "no-club" && (
          <GlassCard variant="solid" pad="lg" animateIn={false} className="text-center">
            <p className="font-semibold">Вы пока не управляете ни одним клубом</p>
          </GlassCard>
        )}

        {status === "denied" && (
          <GlassCard variant="solid" pad="lg" animateIn={false} className="text-center">
            <p className="font-semibold">Раздел недоступен</p>
          </GlassCard>
        )}

        {status === "loading" && (
          <div className="flex flex-col gap-3">
            <div className="h-24 animate-pulse rounded-3xl bg-muted" />
            <div className="h-40 animate-pulse rounded-3xl bg-muted" />
          </div>
        )}

        {status === "error" && (
          <GlassCard variant="solid" pad="lg" animateIn={false} className="text-center">
            <p className="font-semibold">Не удалось загрузить</p>
            <Button className="mt-4" variant="secondary" onClick={() => reloadTeam()}>Повторить</Button>
          </GlassCard>
        )}

        {status === "ready" && dashboard && members && (
          <>
            {msg && <p className="text-sm text-red-500">{msg}</p>}

            <motion.div variants={cardIn} className="grid grid-cols-2 gap-3">
              <GlassCard variant="solid" pad="md" animateIn={false}>
                <p className="text-xs text-muted-foreground">Сотрудников</p>
                <p className="mt-1 text-2xl font-extrabold tabular-nums">{dashboard.summary.employeeCount}</p>
              </GlassCard>
              <GlassCard variant="solid" pad="md" animateIn={false} className={cn(dashboard.summary.pendingApprovalCount > 0 && "border border-brand/30")}>
                <p className="text-xs text-muted-foreground">Ожидают подтверждения</p>
                <p className="mt-1 text-2xl font-extrabold tabular-nums">{dashboard.summary.pendingApprovalCount}</p>
              </GlassCard>
            </motion.div>

            <motion.div variants={cardIn}>
              <GlassCard variant="solid" pad="lg" animateIn={false}>
                <div className="flex items-center gap-2">
                  <span className="flex size-9 items-center justify-center rounded-2xl bg-brand/12">
                    <GraduationCap className="size-5 text-brand" />
                  </span>
                  <p className="font-bold">Обучение команды</p>
                </div>
                {dashboard.training ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    Завершили все опубликованные уроки: {dashboard.training.employeesCompleted} · Проходят обучение: {dashboard.training.employeesInTraining}
                  </p>
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">Нет данных</p>
                )}
              </GlassCard>
            </motion.div>

            {(() => {
              const pending = filterPendingEmployees(members);
              const rest = members.filter((m) => m.accessStatus !== "PENDING_APPROVAL");
              return (
                <>
                  <motion.div variants={cardIn} className="flex flex-col gap-3">
                    <p className="px-1 text-sm font-bold text-foreground">Новые сотрудники</p>
                    {pending.length === 0 ? (
                      <GlassCard variant="solid" pad="md" animateIn={false} className="flex items-center gap-3">
                        <CheckCircle2 className="size-5 shrink-0 text-success" />
                        <p className="text-sm text-muted-foreground">Сейчас ничего не требует внимания.</p>
                      </GlassCard>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {pending.map((m) => (
                          <GlassCard
                            key={m.userId}
                            variant="solid"
                            pad="md"
                            animateIn={false}
                            interactive
                            onClick={() => goToEmployeeTraining(m.userId)}
                            className="flex items-center gap-3"
                          >
                            <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-brand/12">
                              <Clock className="size-4.5 text-brand" />
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-semibold">{m.displayName}</p>
                              <p className="truncate text-xs text-muted-foreground">{m.position ?? "—"}</p>
                            </div>
                            {!dashboard.isPreviewing && !isReadOnlyDrillDown && (
                              <Button
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  approve(m.userId);
                                }}
                                disabled={busyId === m.userId}
                              >
                                <UserCheck className="size-3.5" /> {busyId === m.userId ? "…" : "Подтвердить"}
                              </Button>
                            )}
                          </GlassCard>
                        ))}
                      </div>
                    )}
                  </motion.div>

                  <motion.div variants={cardIn} className="flex flex-col gap-3">
                    <p className="px-1 text-sm font-bold text-foreground">Все сотрудники</p>
                    <GlassCard variant="solid" pad="none" animateIn={false} className="divide-y divide-border">
                      {rest.length === 0 ? (
                        <p className="p-4 text-sm text-muted-foreground">В клубе пока нет сотрудников.</p>
                      ) : (
                        rest.map((m) => <MemberRow key={m.userId} member={m} onClick={() => goToEmployeeTraining(m.userId)} />)
                      )}
                    </GlassCard>
                  </motion.div>
                </>
              );
            })()}
          </>
        )}
      </motion.main>
    </div>
  );
}

function MemberRow({ member, onClick }: { member: CabinetTeamMemberDTO; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 p-4 text-left transition-colors active:bg-muted/60"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-muted">
        <Users className="size-4.5 text-muted-foreground" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{member.displayName}</p>
        <p className="truncate text-xs text-muted-foreground">{member.position ?? "—"}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-xs font-semibold tabular-nums">
          {member.academy.progressPercent != null ? `${member.academy.progressPercent}%` : "Нет данных"}
        </p>
        {member.academy.latestTestResult && (
          <p className={cn("text-[11px] font-medium", member.academy.latestTestResult.passed ? "text-success" : "text-muted-foreground")}>
            {member.academy.latestTestResult.scorePercent}% тест
          </p>
        )}
      </div>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
    </button>
  );
}
