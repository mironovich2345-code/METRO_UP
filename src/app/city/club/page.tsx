"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronRight, Clock, Eye, GraduationCap, RotateCw, ShieldOff, UserCog, Users } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { AttentionItem, ManagementListRow, ManagementSummary } from "@/components/management/management-primitives";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { RevalidatingBar } from "@/components/ui/revalidating-bar";
import { ApiError } from "@/lib/api/client";
import { cabinetApi } from "@/lib/api/cabinet-client";
import { rolesApi, viewAsApi } from "@/lib/api/roles-client";
import { fetchProfileManagementRoles } from "@/lib/api/home-client";
import type { CabinetTeamMemberDTO } from "@/lib/api/cabinet-client";
import { useQuery, QUERY_POLICY, invalidatePrefix } from "@/lib/client/query-cache";
import { cacheKeys, cacheKeyPrefixes } from "@/lib/client/cache-keys";
import { canRestoreAssignment, describeRoleAssignmentError, pluralRu, resolveCityClubPageStatus } from "@/lib/cabinet-ui";
import { cardIn, staggerStack, springSoft } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * Sprint: mini-app-role-experience, section 13 — CITY_MANAGER's club detail
 * Mini App screen. Mirrors CityManagerClubDetail.tsx's (desktop) three
 * independent, already-scope-checked reads — cabinetApi.clubManager(clubId),
 * cabinetApi.clubManagerTeam(clubId), rolesApi.list({clubId,
 * role:"CLUB_MANAGER"}) — and the exact same assign/revoke/restore actions
 * (rolesApi.create/revoke/restore). No parallel assignment backend (section
 * 14's mandate) — this is a mobile re-presentation, not a new read/write path.
 */
export default function CityClubDetailPage() {
  const search = useSearchParams();
  const clubId = search.get("clubId");
  return clubId ? <ClubDetail clubId={clubId} /> : <MissingClub />;
}

function MissingClub() {
  return (
    <div className="relative min-h-[100dvh] pb-24">
      <AppHeader title="Клуб" showBack backHref="/city" showThemeSwitcher={false} />
      <div className="px-5 pt-6">
        <GlassCard variant="solid" pad="lg" animateIn={false} className="text-center">
          <p className="font-semibold">Клуб не указан</p>
        </GlassCard>
      </div>
    </div>
  );
}

// Sprint: mini-app-performance — a coarse, shared "this changed a club's
// role/roster state" invalidation, reused by assign/revoke/restore below.
function invalidateAfterClubRoleChange() {
  invalidatePrefix(cacheKeyPrefixes.city);
  invalidatePrefix(cacheKeyPrefixes.home);
  invalidatePrefix(cacheKeyPrefixes.team);
}

function ClubDetail({ clubId }: { clubId: string }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [startingPreview, setStartingPreview] = useState(false);

  // The SAME three independent, already-scope-checked reads as before,
  // bundled under one cache key/fetcher — MUTABLE: pendingApprovalCount,
  // the manager assignment, and attention items all change from another
  // actor's action at any time.
  const {
    data,
    error,
    isValidating,
    mutate: reload,
  } = useQuery(
    cacheKeys.cityClub(clubId),
    () =>
      Promise.all([cabinetApi.clubManager(clubId), cabinetApi.clubManagerTeam(clubId), rolesApi.list({ clubId, role: "CLUB_MANAGER" })]).then(
        ([d, t, r]) => ({ dashboard: d, team: t.members, managerRows: r.assignments }),
      ),
    QUERY_POLICY.MUTABLE,
  );

  /**
   * METRO UP ROUND 1, section 3C (pre-round cleanup) — audited regression:
   * this page's three reads (cabinetApi.clubManager/clubManagerTeam,
   * rolesApi.list) are the SAME tier-based reads a real CLUB_MANAGER
   * legitimately uses for their OWN club's /team and Home dashboard
   * (resolveClubManagerCabinetAccess's tier 2) — so they succeed for a
   * CLUB_MANAGER who ends up here too, not just for a CITY_MANAGER. Every
   * WRITE this page offers is already correctly server-denied for a plain
   * CLUB_MANAGER regardless (canStartViewAs/canRevokeRole/canAssignRole all
   * require an actual CITY_MANAGER grant — verified by reading authorize-
   * core.ts, not assumed) — but the page would still RENDER "Посмотреть
   * кабинет Управляющего" / "Снять" / "Назначить" / "Восстановить" for them,
   * which is confusing at best (every click would then fail) and simply
   * wrong to show at all. Fixed by an explicit, additional check: this
   * page's content requires the VIEWER to actually hold an active
   * CITY_MANAGER grant, re-using the existing, already-correct
   * /api/profile/management-roles endpoint (Profile's own "Роль в Metro UP"
   * section) rather than inventing a new check — a plain CLUB_MANAGER's
   * roles array never contains a CITY_MANAGER entry.
   */
  const { data: managementRoles, isLoading: rolesLoading } = useQuery(
    cacheKeys.profileManagementRoles(),
    () => fetchProfileManagementRoles().then((r) => r.roles),
    QUERY_POLICY.MEDIUM,
  );
  const isCityManager = managementRoles?.some((r) => r.type === "CITY_MANAGER") ?? false;

  const dashboard = data?.dashboard ?? null;
  const team = data?.team ?? null;
  const managerRows = data?.managerRows ?? null;
  const status = resolveCityClubPageStatus({
    isForbiddenError: error instanceof ApiError && (error.status === 403 || error.status === 401),
    isOtherError: Boolean(error) && !(error instanceof ApiError && (error.status === 403 || error.status === 401)),
    dataReady: Boolean(data),
    rolesLoading,
    isCityManager,
  });

  const currentManager = managerRows?.find((r) => r.status === "ACTIVE") ?? null;
  const history = managerRows?.filter((r) => r.status !== "ACTIVE") ?? [];

  // Management UX Round D, section 3 — same honest, no-forced-zero copy as
  // ClubManagerHomeSection's own trainingSubtitle (home/page.tsx, Round
  // B.1) — only real ClubTrainingSummaryDTO fields, each clause appears
  // only when its own count is genuinely > 0.
  const trainingSubtitle = (() => {
    const training = dashboard?.training;
    if (!training || training.totalPublishedLessons === 0) return "Нет данных";
    const parts: string[] = [];
    if (training.employeesCompleted > 0) parts.push(`Завершили всё: ${training.employeesCompleted}`);
    if (training.employeesInTraining > 0) {
      parts.push(`${training.employeesInTraining} ${pluralRu(training.employeesInTraining, "проходит обучение", "проходят обучение", "проходят обучение")}`);
    }
    return parts.length > 0 ? parts.join(" · ") : "Пока никто не начал обучение";
  })();

  const revoke = async (id: string) => {
    setBusyId(id);
    setMsg(null);
    try {
      await rolesApi.revoke(id);
      await reload();
      invalidateAfterClubRoleChange();
    } catch (e) {
      setMsg(describeRoleAssignmentError(e instanceof ApiError ? e.code : null));
    } finally {
      setBusyId(null);
    }
  };

  const restore = async (id: string) => {
    setBusyId(id);
    setMsg(null);
    try {
      await rolesApi.restore(id);
      await reload();
      invalidateAfterClubRoleChange();
    } catch (e) {
      setMsg(describeRoleAssignmentError(e instanceof ApiError ? e.code : null));
    } finally {
      setBusyId(null);
    }
  };

  /**
   * Sprint: manual-test-round-2, section 3 — "CITY_MANAGER must have a
   * default ability to inspect any club inside their scope through the
   * CLUB_MANAGER cabinet experience." Reuses the EXISTING View As
   * infrastructure unchanged (viewAsApi.start, the same call
   * CityManagerClubDetail.tsx's desktop "Просмотреть как" already makes) —
   * no new preview mechanism. Works with no real manager assigned:
   * buildSyntheticPersona (effective-context.ts) builds the read persona
   * from clubId alone, never from an existing RoleAssignment row — audited
   * before adding this button, not assumed.
   */
  const viewAsClubManager = async () => {
    setStartingPreview(true);
    setMsg(null);
    try {
      await viewAsApi.start({ role: "CLUB_MANAGER", clubId });
      router.push("/home");
    } catch (e) {
      setStartingPreview(false);
      setMsg(describeRoleAssignmentError(e instanceof ApiError ? e.code : null));
    }
  };

  return (
    <div className="relative min-h-[100dvh] pb-24">
      <AppHeader title={dashboard?.clubName ?? "Клуб"} showBack backHref="/city" showThemeSwitcher={false} />
      <RevalidatingBar show={Boolean(data) && isValidating} />

      <motion.main variants={staggerStack} initial="hidden" animate="show" className="flex flex-col gap-5 px-5 pt-2">
        {msg && <p className="text-sm text-red-500">{msg}</p>}

        {status === "loading" && (
          <div className="flex flex-col gap-3">
            <div className="h-24 animate-pulse rounded-3xl bg-muted" />
            <div className="h-40 animate-pulse rounded-3xl bg-muted" />
          </div>
        )}
        {status === "denied" && (
          <GlassCard variant="solid" pad="lg" animateIn={false} className="text-center">
            <p className="font-semibold">Клуб недоступен для вашей зоны ответственности</p>
          </GlassCard>
        )}
        {status === "error" && (
          <GlassCard variant="solid" pad="lg" animateIn={false} className="text-center">
            <p className="font-semibold">Не удалось загрузить</p>
            <Button className="mt-4" variant="secondary" onClick={() => reload()}>Повторить</Button>
          </GlassCard>
        )}

        {status === "ready" && dashboard && (
          <>
            <motion.div variants={cardIn}>
              <ManagementSummary
                stats={[
                  { key: "employees", label: "Сотрудники", value: dashboard.summary.employeeCount },
                  { key: "pending", label: "Ожидают", value: dashboard.summary.pendingApprovalCount },
                ]}
              />
            </motion.div>

            {/* ---- Управляющий (section 13) — Management UX Round D,
                section 3: one compact section, View As + Снять/Назначить
                folded in as visually SECONDARY actions (ghost/secondary
                small buttons) instead of View As being the biggest object
                on the page (the previous standalone full-width button). View
                As stays available regardless of whether a manager is
                assigned — buildSyntheticPersona needs only clubId — same
                as before. */}
            <motion.div variants={cardIn} className="flex flex-col gap-3">
              <p className="px-1 text-sm font-bold text-foreground">Управляющий</p>
              <GlassCard variant="solid" pad="md" animateIn={false} className="flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-muted">
                    <UserCog className="size-4.5 text-muted-foreground" />
                  </span>
                  {currentManager ? (
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{currentManager.userDisplayName}</p>
                      <p className="text-xs text-muted-foreground">Назначен {new Date(currentManager.startedAt).toLocaleDateString("ru-RU")}</p>
                    </div>
                  ) : (
                    <p className="min-w-0 flex-1 text-sm text-muted-foreground">Не назначен</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={viewAsClubManager}
                    disabled={startingPreview}
                    className="h-auto min-h-9 flex-1 whitespace-normal py-1.5 text-center leading-snug"
                  >
                    <Eye className="size-3.5 shrink-0" /> {startingPreview ? "…" : "Посмотреть кабинет"}
                  </Button>
                  {currentManager ? (
                    <Button size="sm" variant="ghost" onClick={() => revoke(currentManager.id)} disabled={busyId === currentManager.id}>
                      <ShieldOff className="size-3.5" /> {busyId === currentManager.id ? "…" : "Снять"}
                    </Button>
                  ) : (
                    <Button size="sm" variant="secondary" onClick={() => setAssigning(true)}>
                      Назначить
                    </Button>
                  )}
                </div>
              </GlassCard>

              {history.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <p className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">История</p>
                  {history.map((r) => (
                    <div key={r.id} className="flex items-center justify-between gap-3 rounded-2xl border border-border px-4 py-2.5 text-sm">
                      <span className="truncate">
                        {r.userDisplayName} <span className="text-muted-foreground">· {r.status === "SUSPENDED" ? "Отозвано" : "Завершено"}</span>
                      </span>
                      {r.status === "SUSPENDED" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => restore(r.id)}
                          disabled={busyId === r.id || !canRestoreAssignment(Boolean(currentManager))}
                        >
                          <RotateCw className="size-3.5" /> {busyId === r.id ? "…" : "Восстановить"}
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </motion.div>

            {/* ---- Сотрудники — Round D adds the employee drill-down tap
                (/team/employee, the SAME shared, independently-authorized
                screen /team's own roster already links to) that this
                screen never had before. ---- */}
            <motion.div variants={cardIn} className="flex flex-col gap-3">
              <p className="px-1 text-sm font-bold text-foreground">Сотрудники</p>
              <GlassCard variant="solid" pad="none" animateIn={false} className="divide-y divide-border">
                {!team || team.length === 0 ? (
                  <p className="p-4 text-sm text-muted-foreground">В клубе пока нет сотрудников.</p>
                ) : (
                  team.map((m) => (
                    <button
                      key={m.userId}
                      type="button"
                      onClick={() => router.push(`/team/employee?userId=${m.userId}&clubId=${clubId}`)}
                      className="flex w-full items-center gap-3 p-4 text-left transition-colors active:bg-foreground/5"
                    >
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-muted">
                        <Users className="size-4.5 text-muted-foreground" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{m.displayName}</p>
                        <p className="truncate text-xs text-muted-foreground">{m.position ?? "—"}</p>
                      </div>
                      <p className="shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">
                        {m.academy.progressPercent != null ? `${m.academy.progressPercent}%` : "Нет данных"}
                      </p>
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground/50" />
                    </button>
                  ))
                )}
              </GlassCard>
            </motion.div>

            {/* ---- Обучение — compact navigation row, routes to the SAME
                /team?clubId= destination the old standalone "Открыть
                команду" button used (removed below — this row now covers
                it, per the target IA, which has no separate button). ---- */}
            <motion.div variants={cardIn}>
              <GlassCard variant="solid" pad="none" animateIn={false}>
                <ManagementListRow
                  icon={GraduationCap}
                  title="Обучение"
                  subtitle={trainingSubtitle}
                  onClick={() => router.push(`/team?clubId=${clubId}`)}
                />
              </GlassCard>
            </motion.div>

            {/* ---- Требует внимания — only rendered when genuinely
                non-empty (section 3's explicit "do not render a large empty
                attention section at the bottom"). Every item here is a
                PENDING_EMPLOYEE_APPROVAL entry for THIS club
                (getClubManagerDashboard never emits any other category) —
                entityId is the employee's userId, so tapping opens that same
                employee's existing training detail, the same destination the
                Сотрудники row right above already offers for that person. */}
            {dashboard.attention.length > 0 && (
              <motion.div variants={cardIn} className="flex flex-col gap-3">
                <p className="px-1 text-sm font-bold text-foreground">Требует внимания</p>
                <div className="flex flex-col gap-2">
                  {dashboard.attention.map((a) => (
                    <AttentionItem
                      key={a.entityId}
                      icon={Clock}
                      text={`${a.entityName} ожидает подтверждения`}
                      onClick={() => router.push(`/team/employee?userId=${a.entityId}&clubId=${clubId}`)}
                    />
                  ))}
                </div>
              </motion.div>
            )}
          </>
        )}
      </motion.main>

      <AssignManagerSheet
        open={assigning}
        clubId={clubId}
        clubName={dashboard?.clubName ?? null}
        onClose={() => setAssigning(false)}
        onAssigned={() => {
          setAssigning(false);
          reload();
          invalidateAfterClubRoleChange();
        }}
      />
    </div>
  );
}

/** Candidate picker backed by cabinetApi.clubManagerTeam(clubId) — same
 * scoped read model as ClubManagerAssignModal.tsx (desktop), so the picker
 * can never surface anyone outside this club. Submission reuses
 * rolesApi.create() unchanged — no second role-management backend. */
function AssignManagerSheet({
  open,
  clubId,
  clubName,
  onClose,
  onAssigned,
}: {
  open: boolean;
  clubId: string;
  clubName: string | null;
  onClose: () => void;
  onAssigned: () => void;
}) {
  const [members, setMembers] = useState<CabinetTeamMemberDTO[] | null>(null);
  const [loadStatus, setLoadStatus] = useState<"loading" | "ready" | "error">("loading");
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Sprint: manual-test-round-2, section 1 (P0) — a lingering View-As cookie
  // (e.g. an earlier "Просмотреть как" preview never explicitly ended, live
  // up to its 30-minute TTL) is the one error the user can actually fix
  // themselves from right here — offer a one-tap way to end it and retry,
  // instead of a dead-end message.
  const [errCode, setErrCode] = useState<string | null>(null);
  const [endingPreview, setEndingPreview] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelected(null);
    setErr(null);
    setErrCode(null);
    setLoadStatus("loading");
    cabinetApi
      .clubManagerTeam(clubId)
      .then((d) => {
        setMembers(d.members);
        setLoadStatus("ready");
      })
      .catch(() => setLoadStatus("error"));
  }, [open, clubId]);

  const submit = async () => {
    if (!selected) {
      setErr("Выберите сотрудника.");
      setErrCode(null);
      return;
    }
    setBusy(true);
    setErr(null);
    setErrCode(null);
    try {
      await rolesApi.create({ userId: selected, role: "CLUB_MANAGER", scopeType: "CLUB", clubId });
      onAssigned();
    } catch (e) {
      const code = e instanceof ApiError ? e.code : null;
      // Safe, non-PII diagnostic — the short server error code only, so a
      // real-device tester can always report exactly what happened.
      console.error(`[assign-manager-error] ${JSON.stringify({ code, status: e instanceof ApiError ? e.status : null })}`);
      setErrCode(code);
      setErr(describeRoleAssignmentError(code));
    } finally {
      setBusy(false);
    }
  };

  const endPreviewAndRetry = async () => {
    setEndingPreview(true);
    try {
      await viewAsApi.end();
      setErr(null);
      setErrCode(null);
    } catch {
      setErr(describeRoleAssignmentError(null));
    } finally {
      setEndingPreview(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50">
          <motion.div className="absolute inset-0 bg-black/45" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div
            className="absolute inset-x-0 bottom-0 max-h-[80dvh] overflow-y-auto rounded-t-3xl border-t border-border bg-card p-6 pb-[calc(env(safe-area-inset-bottom)+24px)]"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={springSoft}
          >
            <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-border" />
            <h2 className="text-lg font-bold">Назначить управляющего</h2>
            <p className="mt-1 text-sm text-muted-foreground">Клуб «{clubName ?? "—"}»</p>

            <div className="mt-4">
              {loadStatus === "loading" && <p className="text-sm text-muted-foreground">Загрузка сотрудников…</p>}
              {loadStatus === "error" && <p className="text-sm text-red-500">Не удалось загрузить сотрудников клуба.</p>}
              {loadStatus === "ready" && members && members.length === 0 && (
                <p className="text-sm text-muted-foreground">В клубе пока нет сотрудников.</p>
              )}
              {loadStatus === "ready" && members && members.length > 0 && (
                <div className="flex max-h-64 flex-col gap-2 overflow-y-auto">
                  {members.map((m) => (
                    <button
                      key={m.userId}
                      onClick={() => setSelected(m.userId)}
                      className={cn(
                        "flex items-center gap-2 rounded-2xl border border-border px-4 py-3 text-left text-sm",
                        selected === m.userId && "border-brand bg-brand/10",
                      )}
                    >
                      <span className="min-w-0 flex-1 truncate font-medium">{m.displayName}</span>
                      <span className="shrink-0 truncate text-xs text-muted-foreground">{m.position ?? "—"}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {err && (
              <div className="mt-3">
                <p className="text-sm text-red-500">{err}</p>
                {errCode === "VIEW_AS_READ_ONLY" && (
                  <Button size="sm" variant="secondary" className="mt-2" onClick={endPreviewAndRetry} disabled={endingPreview}>
                    {endingPreview ? "…" : "Завершить предпросмотр"}
                  </Button>
                )}
              </div>
            )}

            <div className="mt-5 flex gap-3">
              <Button variant="secondary" block onClick={onClose}>Отмена</Button>
              <Button block disabled={busy || !selected} onClick={submit}>
                <UserCog className="size-4" /> {busy ? "…" : "Назначить"}
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
