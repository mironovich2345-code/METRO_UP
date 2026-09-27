"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Clock, Eye, GraduationCap, RotateCw, ShieldOff, UserCog, Users } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api/client";
import { cabinetApi } from "@/lib/api/cabinet-client";
import { rolesApi, viewAsApi } from "@/lib/api/roles-client";
import type { CabinetTeamMemberDTO, ClubManagerDashboardDTO } from "@/lib/api/cabinet-client";
import type { RoleAssignmentRowDTO } from "@/lib/api/roles-types";
import { canRestoreAssignment, describeRoleAssignmentError } from "@/lib/cabinet-ui";
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

function ClubDetail({ clubId }: { clubId: string }) {
  const router = useRouter();
  const [dashboard, setDashboard] = useState<ClubManagerDashboardDTO | null>(null);
  const [team, setTeam] = useState<CabinetTeamMemberDTO[] | null>(null);
  const [managerRows, setManagerRows] = useState<RoleAssignmentRowDTO[] | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "denied">("loading");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [startingPreview, setStartingPreview] = useState(false);

  const load = useCallback(() => {
    setStatus("loading");
    Promise.all([cabinetApi.clubManager(clubId), cabinetApi.clubManagerTeam(clubId), rolesApi.list({ clubId, role: "CLUB_MANAGER" })])
      .then(([d, t, r]) => {
        setDashboard(d);
        setTeam(t.members);
        setManagerRows(r.assignments);
        setStatus("ready");
      })
      .catch((e) => setStatus(e instanceof ApiError && (e.status === 403 || e.status === 401) ? "denied" : "error"));
  }, [clubId]);
  useEffect(load, [load]);

  const currentManager = managerRows?.find((r) => r.status === "ACTIVE") ?? null;
  const history = managerRows?.filter((r) => r.status !== "ACTIVE") ?? [];

  const revoke = async (id: string) => {
    setBusyId(id);
    setMsg(null);
    try {
      await rolesApi.revoke(id);
      load();
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
      load();
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
            <Button className="mt-4" variant="secondary" onClick={load}>Повторить</Button>
          </GlassCard>
        )}

        {status === "ready" && dashboard && (
          <>
            <motion.div variants={cardIn} className="grid grid-cols-2 gap-3">
              <GlassCard variant="solid" pad="md" animateIn={false}>
                <p className="text-xs text-muted-foreground">Сотрудников</p>
                <p className="mt-1 text-2xl font-extrabold tabular-nums">{dashboard.summary.employeeCount}</p>
              </GlassCard>
              <GlassCard variant="solid" pad="md" animateIn={false}>
                <p className="text-xs text-muted-foreground">Ожидают подтверждения</p>
                <p className="mt-1 text-2xl font-extrabold tabular-nums">{dashboard.summary.pendingApprovalCount}</p>
              </GlassCard>
            </motion.div>

            <motion.div variants={cardIn}>
              {/* whitespace-normal override — this label is long enough to
                  overflow a 320px screen with the base Button's nowrap
                  (section 7's mobile pass); wraps to two lines instead. */}
              <Button variant="secondary" block onClick={viewAsClubManager} disabled={startingPreview} className="h-auto min-h-14 whitespace-normal py-3 text-center leading-snug">
                <Eye className="size-4 shrink-0" /> {startingPreview ? "…" : "Посмотреть кабинет Управляющего"}
              </Button>
            </motion.div>

            {/* ---- Управляющий (section 13) ---- */}
            <motion.div variants={cardIn} className="flex flex-col gap-3">
              <p className="px-1 text-sm font-bold text-foreground">Управляющий</p>
              {currentManager ? (
                <GlassCard variant="solid" pad="md" animateIn={false} className="flex items-center gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-brand/12">
                    <UserCog className="size-4.5 text-brand" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{currentManager.userDisplayName}</p>
                    <p className="text-xs text-muted-foreground">Назначен {new Date(currentManager.startedAt).toLocaleDateString("ru-RU")}</p>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => revoke(currentManager.id)} disabled={busyId === currentManager.id}>
                    <ShieldOff className="size-3.5" /> {busyId === currentManager.id ? "…" : "Снять"}
                  </Button>
                </GlassCard>
              ) : (
                <GlassCard variant="solid" pad="md" animateIn={false} className="flex items-center gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-muted">
                    <UserCog className="size-4.5 text-muted-foreground" />
                  </span>
                  <p className="min-w-0 flex-1 text-sm text-muted-foreground">Не назначен</p>
                  <Button size="sm" onClick={() => setAssigning(true)}>Назначить</Button>
                </GlassCard>
              )}

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

            {/* ---- Сотрудники ---- */}
            <motion.div variants={cardIn} className="flex flex-col gap-3">
              <p className="px-1 text-sm font-bold text-foreground">Сотрудники</p>
              <GlassCard variant="solid" pad="none" animateIn={false} className="divide-y divide-border">
                {!team || team.length === 0 ? (
                  <p className="p-4 text-sm text-muted-foreground">В клубе пока нет сотрудников.</p>
                ) : (
                  team.map((m) => (
                    <div key={m.userId} className="flex items-center gap-3 p-4">
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
                    </div>
                  ))
                )}
              </GlassCard>
            </motion.div>

            {/* ---- Обучение ---- */}
            <motion.div variants={cardIn}>
              <GlassCard variant="solid" pad="lg" animateIn={false}>
                <div className="flex items-center gap-2">
                  <span className="flex size-9 items-center justify-center rounded-2xl bg-brand/12">
                    <GraduationCap className="size-5 text-brand" />
                  </span>
                  <p className="font-bold">Обучение</p>
                </div>
                {dashboard.training ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    Проходят обучение: {dashboard.training.employeesInTraining} · Завершили все опубликованные уроки: {dashboard.training.employeesCompleted}
                  </p>
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">Нет данных</p>
                )}
              </GlassCard>
            </motion.div>

            {/* ---- Требует внимания ---- */}
            <motion.div variants={cardIn} className="flex flex-col gap-3">
              <p className="px-1 text-sm font-bold text-foreground">Требует внимания</p>
              {dashboard.attention.length === 0 ? (
                <GlassCard variant="solid" pad="md" animateIn={false} className="flex items-center gap-3">
                  <CheckCircle2 className="size-5 shrink-0 text-success" />
                  <p className="text-sm text-muted-foreground">Сейчас ничего не требует внимания.</p>
                </GlassCard>
              ) : (
                <div className="flex flex-col gap-2">
                  {dashboard.attention.map((a) => (
                    <GlassCard key={a.entityId} variant="solid" pad="md" animateIn={false} className="flex items-center gap-3">
                      <Clock className={cn("size-4.5 shrink-0", "text-brand")} />
                      <p className="min-w-0 flex-1 truncate text-sm">
                        {a.category === "PENDING_EMPLOYEE_APPROVAL" ? `${a.entityName} ожидает подтверждения` : a.entityName}
                      </p>
                    </GlassCard>
                  ))}
                </div>
              )}
            </motion.div>

            <Button variant="secondary" block onClick={() => router.push(`/team`)}>
              Открыть команду
            </Button>
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
          load();
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
