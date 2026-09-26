"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Building2,
  GraduationCap,
  RotateCw,
  ShieldOff,
  Users,
  UserCog,
  AlertCircle,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { cabinetApi } from "@/lib/api/cabinet-client";
import { rolesApi } from "@/lib/api/roles-client";
import type {
  AttentionItemDTO,
  CityManagerClubSummaryDTO,
  CityManagerDashboardDTO,
  ClubManagerAssignmentDTO,
} from "@/lib/api/cabinet-client";
import { attentionCardCount, clubsWithoutManager, distinctCityNames, groupPendingApprovalByClub, pluralRu } from "@/lib/cabinet-ui";
import { cn } from "@/lib/utils";

/**
 * Sprint: role-cabinets, step 5 — the CITY_MANAGER ("Ст. города") cabinet.
 * One dashboard query (GET /api/control/cabinet/city-manager, built in step
 * 4) drives the whole page; club/team DETAIL data is fetched separately,
 * only when a club is opened (see CityManagerClubDetail) — no frontend N+1
 * against the summary, no duplicated server aggregates recomputed here.
 *
 * Supersedes CityManagerClubs.tsx (the Phase 2B "Мои клубы" list), which is
 * removed this step — every piece of its functionality (club list, View As
 * triggers) is carried forward, either here or in the new club detail page,
 * with real management data added on top rather than a second, overlapping
 * screen kept alive alongside it.
 */

export function CityManagerCabinet() {
  const [dashboard, setDashboard] = useState<CityManagerDashboardDTO | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "denied">("loading");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const load = useCallback(() => {
    setStatus("loading");
    cabinetApi
      .cityManager()
      .then((d) => {
        setDashboard(d);
        setStatus("ready");
      })
      .catch((e) => setStatus(e instanceof ApiError && (e.status === 403 || e.status === 401) ? "denied" : "error"));
  }, []);
  useEffect(load, [load]);

  const cityNames = useMemo(() => (dashboard ? distinctCityNames(dashboard.clubs) : []), [dashboard]);

  const revokeManager = async (assignmentId: string) => {
    setBusyId(assignmentId);
    setActionMsg(null);
    try {
      await rolesApi.revoke(assignmentId);
      load();
    } catch {
      setActionMsg("Не удалось отозвать назначение.");
    } finally {
      setBusyId(null);
    }
  };

  if (status === "denied") return <p className="text-sm text-muted-foreground">Раздел доступен только Ст. города.</p>;
  if (status === "error") {
    return (
      <div className="rounded-3xl border border-border bg-card p-6 text-center">
        <p className="text-sm text-red-500">Не удалось загрузить кабинет.</p>
        <button onClick={load} className="mt-3 inline-flex items-center gap-1.5 rounded-2xl border border-border px-4 py-2 text-sm font-semibold">
          <RotateCw className="size-4" /> Повторить
        </button>
      </div>
    );
  }
  if (status === "loading" || !dashboard) return <CabinetSkeleton />;

  return (
    <div>
      {/* ---- Header (section 4) ---- */}
      <div>
        <h1 className="text-2xl font-bold">Ст. города</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {cityNames.length === 0
            ? "Зона ответственности: отдельные клубы"
            : cityNames.length === 1
              ? cityNames[0]
              : `Города: ${cityNames.join(", ")}`}
          {" · "}
          {dashboard.summary.clubCount} {pluralRu(dashboard.summary.clubCount, "клуб", "клуба", "клубов")}
        </p>
      </div>

      {/* ---- Summary cards (section 5) ---- */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard icon={Building2} label="Клубов" value={dashboard.summary.clubCount} />
        <SummaryCard icon={Users} label="Сотрудников" value={dashboard.summary.employeeCount} />
        <SummaryCard icon={UserCog} label="Управляющих" value={dashboard.summary.clubManagerCount} />
        <SummaryCard
          icon={Clock}
          label="Ожидают подтверждения"
          value={dashboard.summary.pendingApprovalCount}
          emphasize={dashboard.summary.pendingApprovalCount > 0}
        />
      </div>

      {/* ---- Training (section 5/12) — safe labels only, honest empty state ---- */}
      <div className="mt-4 rounded-3xl border border-border bg-card p-5">
        <p className="inline-flex items-center gap-2 text-sm font-bold">
          <GraduationCap className="size-4 text-brand" /> Прогресс обучения
        </p>
        {dashboard.training ? (
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Средний прогресс</p>
              <p className="mt-0.5 text-lg font-bold tabular-nums">
                {dashboard.training.averageProgressPercent != null ? `${dashboard.training.averageProgressPercent}%` : "Нет данных"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Завершили все опубликованные уроки</p>
              <p className="mt-0.5 text-lg font-bold tabular-nums">{dashboard.training.employeesCompletedAll}</p>
            </div>
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">Нет данных.</p>
        )}
      </div>

      {/* ---- Attention (section 6) ---- */}
      <AttentionSection attention={dashboard.attention} />

      {/* ---- Мои клубы (section 7) ---- */}
      <div className="mt-8">
        <h2 className="text-lg font-bold">Мои клубы</h2>
        {dashboard.clubs.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">В вашей зоне пока нет клубов.</p>
        ) : (
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {dashboard.clubs.map((club) => (
              <ClubCard key={club.clubId} club={club} />
            ))}
          </div>
        )}
      </div>

      {/* ---- Управляющие (section 11) ---- */}
      <div className="mt-8">
        <h2 className="text-lg font-bold">Управляющие</h2>
        {actionMsg && <p className="mt-2 text-sm text-red-500">{actionMsg}</p>}
        {dashboard.clubManagers.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">Пока никто не назначен управляющим.</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-3xl border border-border">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Управляющий</th>
                  <th className="px-4 py-3">Клуб</th>
                  <th className="px-4 py-3">Назначен</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {dashboard.clubManagers.map((cm) => (
                  <ClubManagerRow key={cm.assignmentId} cm={cm} busy={busyId === cm.assignmentId} onRevoke={() => revokeManager(cm.assignmentId)} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  emphasize,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  emphasize?: boolean;
}) {
  return (
    <div className="rounded-3xl border border-border bg-card p-4">
      <Icon className={cn("size-4", emphasize && value > 0 ? "text-brand" : "text-muted-foreground")} />
      <p className="mt-2 text-2xl font-bold tabular-nums">{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

/** Sprint: role-cabinets, step 6 — the two V1-supported categories only;
 * PENDING_EMPLOYEE_APPROVAL items are grouped per club (one card with a
 * count, matching the spec's own "2 сотрудника ожидают подтверждения"
 * example) rather than one row per employee, since they all point into the
 * same club detail view anyway. Any unrecognized category (defensive —
 * TRAINING_INCOMPLETE is not produced by the server yet) is silently
 * ignored rather than rendered as a broken row. */
function AttentionSection({ attention }: { attention: AttentionItemDTO[] }) {
  const withoutManager = clubsWithoutManager(attention);
  const pendingGroups = groupPendingApprovalByClub(attention);
  const total = attentionCardCount(attention);

  return (
    <div className="mt-6">
      <h2 className="text-lg font-bold">Требует внимания</h2>
      {total === 0 ? (
        <div className="mt-3 flex items-center gap-2.5 rounded-3xl border border-border bg-card p-5 text-sm text-muted-foreground">
          <CheckCircle2 className="size-4 text-success" /> Сейчас ничего не требует внимания.
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          {withoutManager.map((item) => (
            <Link
              key={`club-${item.entityId}`}
              href={`/control/city/club?clubId=${item.entityId}`}
              className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-sm hover:border-brand"
            >
              <span className="inline-flex items-center gap-2">
                <AlertCircle className="size-4 shrink-0 text-red-500" />В клубе {item.entityName} не назначен Управляющий
              </span>
            </Link>
          ))}
          {pendingGroups.map((entry) => (
            <Link
              key={`pending-${entry.clubId}`}
              href={`/control/city/club?clubId=${entry.clubId}`}
              className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-sm hover:border-brand"
            >
              <span className="inline-flex items-center gap-2">
                <Clock className="size-4 shrink-0 text-brand" />
                {entry.count} {pluralRu(entry.count, "сотрудник", "сотрудника", "сотрудников")}{" "}
                {pluralRu(entry.count, "ожидает", "ожидают", "ожидают")} подтверждения
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function ClubCard({ club }: { club: CityManagerClubSummaryDTO }) {
  return (
    <Link
      href={`/control/city/club?clubId=${club.clubId}`}
      className="block rounded-3xl border border-border bg-card p-5 hover:border-brand"
    >
      <span className="flex size-11 items-center justify-center rounded-2xl bg-brand/12">
        <Building2 className="size-5 text-brand" />
      </span>
      <p className="mt-3 text-lg font-bold">{club.clubName}</p>
      <p className="mt-0.5 text-sm text-muted-foreground">{club.cityName ?? "—"}</p>

      <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2.5 text-sm">
        <Stat label="Управляющий" value={club.activeClubManager?.displayName ?? "Не назначен"} muted={!club.activeClubManager} />
        <Stat label="Сотрудников" value={String(club.employeeCount)} />
        <Stat label="Обучение" value={club.trainingCompletionPercent != null ? `${club.trainingCompletionPercent}%` : "Нет данных"} />
        <Stat
          label="Требует внимания"
          value={String(club.attentionCount)}
          highlight={club.attentionCount > 0}
        />
      </div>
    </Link>
  );
}

function Stat({ label, value, muted, highlight }: { label: string; value: string; muted?: boolean; highlight?: boolean }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("mt-0.5 truncate text-sm font-semibold", muted && "text-muted-foreground", highlight && "text-red-500")}>
        {value}
      </p>
    </div>
  );
}

function ClubManagerRow({ cm, busy, onRevoke }: { cm: ClubManagerAssignmentDTO; busy: boolean; onRevoke: () => void }) {
  return (
    <tr className="border-t border-border">
      <td className="px-4 py-2.5 font-medium">{cm.displayName}</td>
      <td className="px-4 py-2.5 text-muted-foreground">
        <Link href={`/control/city/club?clubId=${cm.clubId}`} className="hover:text-brand hover:underline">
          {cm.clubName}
        </Link>
      </td>
      <td className="px-4 py-2.5 text-muted-foreground">{new Date(cm.startedAt).toLocaleDateString("ru-RU")}</td>
      <td className="px-4 py-2.5 text-right">
        <button
          onClick={onRevoke}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
        >
          <ShieldOff className="size-3.5" /> {busy ? "…" : "Отозвать"}
        </button>
      </td>
    </tr>
  );
}

function CabinetSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-7 w-40 animate-pulse rounded-xl bg-muted" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-3xl bg-muted" />
        ))}
      </div>
      <div className="h-32 animate-pulse rounded-3xl bg-muted" />
      <div className="h-24 animate-pulse rounded-3xl bg-muted" />
    </div>
  );
}
