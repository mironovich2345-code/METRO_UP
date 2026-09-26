"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, Clock, GraduationCap, UserCheck, Users } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { useAppUser } from "@/providers/AppUserProvider";
import { ApiError } from "@/lib/api/client";
import { cabinetApi } from "@/lib/api/cabinet-client";
import { managerApi } from "@/lib/api/club-plan-client";
import type { CabinetTeamMemberDTO, ClubManagerDashboardDTO } from "@/lib/api/cabinet-client";
import type { ClubSummaryDTO } from "@/lib/api/roles-client";
import { cardIn, staggerStack } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { filterPendingEmployees, resolveManagedClubSelection } from "@/lib/cabinet-ui";

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
 * View As: while an active View-As-CLUB_MANAGER preview is running, club
 * selection is skipped entirely — the server always resolves the exact
 * previewed club when clubId is omitted (resolveClubManagerCabinetAccess's
 * tier 1) — and the roster is read-only (dashboard.isPreviewing hides
 * "Подтвердить"; the underlying route is independently guarded server-side
 * by requireClubManagerAccess() checking the REAL actor's own grants, never
 * the preview persona, so a preview can never approve anyone regardless of
 * what this screen renders).
 */
export default function TeamPage() {
  const { user } = useAppUser();
  const isPreviewing = user?.viewContext?.previewRole === "CLUB_MANAGER";

  const [clubs, setClubs] = useState<ClubSummaryDTO[] | null>(null);
  const [selectedClubId, setSelectedClubId] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<ClubManagerDashboardDTO | null>(null);
  const [members, setMembers] = useState<CabinetTeamMemberDTO[] | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "no-club" | "denied">("loading");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  // Resolve which club(s) this real actor manages — skipped while previewing.
  useEffect(() => {
    if (isPreviewing) return;
    cabinetApi
      .myManagedClubs()
      .then((r) => {
        setClubs(r.clubs);
        const selection = resolveManagedClubSelection(r.clubs);
        if (selection.kind === "none") setStatus("no-club");
        else if (selection.kind === "auto") setSelectedClubId(selection.club.id);
      })
      .catch(() => setStatus("error"));
  }, [isPreviewing]);

  const load = useCallback(() => {
    if (!isPreviewing && !selectedClubId) return;
    setStatus("loading");
    Promise.all([cabinetApi.clubManager(selectedClubId ?? undefined), cabinetApi.clubManagerTeam(selectedClubId ?? undefined)])
      .then(([d, t]) => {
        setDashboard(d);
        setMembers(t.members);
        setStatus("ready");
      })
      .catch((e) => setStatus(e instanceof ApiError && (e.status === 403 || e.status === 401) ? "denied" : "error"));
  }, [isPreviewing, selectedClubId]);
  useEffect(load, [load]);

  const approve = async (userId: string) => {
    if (!dashboard?.clubId) return;
    setBusyId(userId);
    setMsg(null);
    try {
      await managerApi.approve(userId, "FULL", dashboard.clubId);
      load();
    } catch {
      setMsg("Не удалось подтвердить сотрудника.");
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
      <AppHeader title="Моя команда" subtitle={dashboard?.clubName ?? undefined} showBack backHref="/home" showThemeSwitcher={false} />

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
            <Button className="mt-4" variant="secondary" onClick={load}>Повторить</Button>
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
                          <GlassCard key={m.userId} variant="solid" pad="md" animateIn={false} className="flex items-center gap-3">
                            <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-brand/12">
                              <Clock className="size-4.5 text-brand" />
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-semibold">{m.displayName}</p>
                              <p className="truncate text-xs text-muted-foreground">{m.position ?? "—"}</p>
                            </div>
                            {!dashboard.isPreviewing && (
                              <Button size="sm" onClick={() => approve(m.userId)} disabled={busyId === m.userId}>
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
                        rest.map((m) => <MemberRow key={m.userId} member={m} />)
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

function MemberRow({ member }: { member: CabinetTeamMemberDTO }) {
  return (
    <div className="flex items-center gap-3 p-4">
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
    </div>
  );
}
