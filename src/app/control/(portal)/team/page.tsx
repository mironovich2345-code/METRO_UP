"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { managerApi } from "@/lib/api/club-plan-client";
import { cabinetApi } from "@/lib/api/cabinet-client";
import { ApiError } from "@/lib/api/client";
import type { AccessStatusDTO, ClubTeamDTO } from "@/lib/api/club-plan-types";
import type { ClubSummaryDTO } from "@/lib/api/roles-client";
import { ClubScopePicker } from "@/components/control/ClubScopePicker";
import { ClubAccessActionButton } from "@/components/control/ClubAccessAction";
import { CLUB_ACCESS_LABEL, applyMemberAccessStatus } from "@/lib/control/club-access";
import { resolvePlanScopeUiState } from "@/lib/control-plan-ui";

/**
 * /control/team — Sprint: LIVE QA QA-05.1: a COMPATIBILITY surface. The club
 * team and its full access lifecycle now live in «Управляющий»
 * (/control/club), which is the primary club-management screen; «Команда» is
 * no longer in the primary navigation. This route stays for bookmarks, old
 * links and the detailed per-employee table (today's plan, lessons) that the
 * cabinet links to with ?clubId=. Access rules, endpoints and status mapping
 * are the SAME shared implementation the cabinet uses
 * (lib/control/club-access.ts + ClubAccessActionButton) — no second copy.
 */
export default function ControlTeamPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Загрузка…</p>}>
      <ControlTeamCompat />
    </Suspense>
  );
}

function ControlTeamCompat() {
  const searchParams = useSearchParams();
  const [team, setTeam] = useState<ClubTeamDTO | null>(null);
  /** The actor's own EXPLICIT choice — relevant for ADMIN (any active club)
   * and, as of R4.3, a CLUB_MANAGER with 2+ eligible clubs (legacy
   * EmployeeProfile.clubId and/or active CLUB_MANAGER grants, unioned and
   * deduplicated server-side) picking among their OWN clubs. null until a
   * choice is made; for every other case (legacy manager, single-grant
   * manager, mixed legacy+grant resolving to one unique club) the server
   * resolves a club with no choice needed at all. Sprint: REMEDIATION R4.3
   * — mirrors control/plan's exact scope model (see that page's own doc
   * comment) so the two pages behave identically for every legacy/grant/
   * mixed shape, per the brief's "ONE consistent scope model" requirement. */
  // ?clubId= (from «Управляющий») pre-selects the club; never trusted — the
  // server re-verifies it against the actor's real scope like any selection.
  const [selectedClubId, setSelectedClubId] = useState<string | null>(() => searchParams.get("clubId"));
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "denied">("loading");
  const [msg, setMsg] = useState<string | null>(null);
  /** Sprint: REMEDIATION R4.3 — lazily fetched ONLY for a non-admin actor,
   * the SAME existing, server-validated "clubs I personally manage"
   * endpoint control/plan already uses (GET /api/control/club/clubs,
   * resolveClubManagerClubs) — never a duplicate/new API. null = not
   * fetched yet. */
  const [managedClubs, setManagedClubs] = useState<ClubSummaryDTO[] | null>(null);

  const load = useCallback(() => {
    setStatus("loading");
    managerApi
      .team(selectedClubId)
      .then((t) => { setTeam(t); setStatus("ready"); })
      .catch((e) => setStatus(e instanceof ApiError && (e.status === 403 || e.status === 401) ? "denied" : "error"));
  }, [selectedClubId]);
  useEffect(() => { load(); }, [load]);

  const scope = team?.scope;
  const isAdmin = Boolean(scope?.canSwitch);
  const isReadyManager = status === "ready" && !!team && !isAdmin;
  const uiState = status === "ready" && team
    ? resolvePlanScopeUiState({
        resolvedClubId: team.clubId,
        isAdmin,
        managedClubsCount: managedClubs ? managedClubs.length : null,
      })
    : null;

  useEffect(() => {
    if (!isReadyManager) { setManagedClubs(null); return; }
    cabinetApi.myManagedClubs().then((r) => setManagedClubs(r.clubs)).catch(() => setManagedClubs([]));
  }, [isReadyManager]);

  // Defensive auto-select: exactly one eligible club should already have
  // been resolved server-side with no selection at all (the single-eligible-
  // club default) — reaching this with length 1 and no resolved club means
  // something upstream (e.g. a just-revoked second grant) changed between
  // requests; self-heal by selecting the one real option rather than
  // showing a one-item picker for a "choice" that isn't one.
  useEffect(() => {
    if (!team?.clubId && managedClubs && managedClubs.length === 1 && !selectedClubId) {
      setSelectedClubId(managedClubs[0].id);
    }
  }, [team?.clubId, managedClubs, selectedClubId]);

  const canPickManagerClub = !isAdmin && managedClubs !== null && managedClubs.length > 1;

  /** The club scope mutations actually use — ALWAYS the server-RESOLVED
   * team.clubId, never the raw, possibly-stale selectedClubId. Sprint:
   * REMEDIATION R4.3 — the exact bug this avoids (control/plan's own R4.2
   * fix, applied here from the start): a raw selection stays null for every
   * non-admin manager until a picker renders, which never happens for a
   * single-club manager, so a scopeClubId sourced from selection alone would
   * 409 every approve/access call for exactly the manager who can read the
   * list fine. */
  const scopeClubId = team?.clubId ?? null;

  const onAccessApplied = (userId: string, next: AccessStatusDTO) => {
    setMsg(null);
    setTeam((t) => (t ? { ...t, members: applyMemberAccessStatus(t.members, userId, next) } : t));
  };

  return (
    <div>
      <div className="mb-4 rounded-2xl border border-brand/30 bg-brand/[0.06] px-4 py-3 text-sm">
        Команда и управление доступом теперь в разделе{" "}
        <Link
          href={team?.clubId ? `/control/club?clubId=${encodeURIComponent(team.clubId)}` : "/control/club"}
          className="font-semibold text-brand hover:underline"
        >
          «Управляющий»
        </Link>
        . Здесь — подробная таблица плана и уроков.
      </div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Команда</h1>
          <p className="mt-1 text-sm text-muted-foreground">{team?.clubName ?? (isAdmin || canPickManagerClub ? "Выберите клуб" : "Ваш клуб")}</p>
        </div>
        {isAdmin && scope && (
          <ClubScopePicker clubs={scope.clubs} value={selectedClubId ?? scope.clubId} onChange={setSelectedClubId} />
        )}
        {canPickManagerClub && managedClubs && (
          <ClubScopePicker clubs={managedClubs} value={selectedClubId ?? team?.clubId ?? null} onChange={setSelectedClubId} label="Ваш клуб" />
        )}
      </div>

      {status === "denied" && <p className="mt-6 text-sm text-red-500">Нет доступа к управлению клубом.</p>}
      {status === "error" && <p className="mt-6 text-sm text-red-500">Не удалось загрузить команду.</p>}
      {msg && <p className="mt-4 text-sm text-red-500">{msg}</p>}

      {uiState && uiState !== "active" && (
        <div className="mt-6 rounded-3xl border border-dashed border-border bg-card/50 p-10 text-center">
          {uiState === "admin-select-club" && (
            <>
              <p className="font-semibold">Выберите клуб</p>
              <p className="mt-1 text-sm text-muted-foreground">Как администратор выберите клуб выше, чтобы увидеть его команду.</p>
            </>
          )}
          {uiState === "loading-manager-clubs" && (
            // Still fetching the manager's own eligible clubs — distinct from
            // the two settled states below so this never flashes "account not
            // linked to a club" while that request is in flight.
            <p className="text-sm text-muted-foreground">Загрузка…</p>
          )}
          {uiState === "manager-select-club" && (
            <>
              <p className="font-semibold">Выберите клуб</p>
              <p className="mt-1 text-sm text-muted-foreground">Вам назначено несколько клубов. Выберите клуб выше, чтобы увидеть его команду.</p>
            </>
          )}
          {uiState === "no-club" && (
            <>
              <p className="font-semibold">Учётная запись не привязана к клубу</p>
              <p className="mt-1 text-sm text-muted-foreground">Обратитесь к администратору, чтобы указать клуб в профиле.</p>
            </>
          )}
        </div>
      )}

      {uiState === "active" && team && (
        <div className="mt-6 overflow-x-auto rounded-3xl border border-border">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Сотрудник</th>
                <th className="px-4 py-3">Должность</th>
                <th className="px-4 py-3">Обучение</th>
                <th className="px-4 py-3">План сегодня</th>
                <th className="px-4 py-3">Доступ</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {team.members.map((m) => (
                <tr key={m.userId} className="border-t border-border">
                  <td className="px-4 py-2.5 font-medium">{m.displayName}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{m.positionTitle ?? "—"}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {m.onboardingCompleted ? "Онбординг пройден" : "Новичок"} · {m.lessonsCompleted} уроков
                  </td>
                  <td className="px-4 py-2.5">{m.planCompleted}/{m.planTotal}</td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${m.accessStatus === "FULL" ? "bg-success-soft text-success" : "bg-muted text-muted-foreground"}`}>
                      {m.accessStatus === "FULL" && <CheckCircle2 className="size-3.5" />}
                      {CLUB_ACCESS_LABEL[m.accessStatus]}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <ClubAccessActionButton userId={m.userId} status={m.accessStatus} clubId={scopeClubId} onApplied={onAccessApplied} onError={setMsg} />
                  </td>
                </tr>
              ))}
              {team.members.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">В клубе нет сотрудников.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
