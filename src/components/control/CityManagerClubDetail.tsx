"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Eye,
  GraduationCap,
  RotateCw,
  ShieldOff,
  UserCog,
  Users,
} from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { cabinetApi } from "@/lib/api/cabinet-client";
import { rolesApi, viewAsApi } from "@/lib/api/roles-client";
import type { CabinetTeamMemberDTO, ClubManagerDashboardDTO } from "@/lib/api/cabinet-client";
import type { RoleAssignmentRowDTO } from "@/lib/api/roles-types";
import { ClubManagerAssignModal } from "@/components/control/ClubManagerAssignModal";
import { canRestoreAssignment } from "@/lib/cabinet-ui";
import { cn } from "@/lib/utils";

/**
 * Sprint: role-cabinets, step 5, section 8 — CITY_MANAGER's read-only club
 * detail. Deliberately NOT control/team (that page is the ACTING manager's
 * own operational plan/task view) — this is a drill-down overview backed by
 * step 4's club-manager cabinet read model, which a CITY_MANAGER already has
 * club.read authority for (resolveClubManagerCabinetAccess's tier 3).
 *
 * Three independent, small, scope-checked reads (never one bigger query
 * duplicating server aggregates client-side):
 *  - cabinetApi.clubManager(clubId)   -> Общее / Обучение / Требует внимания
 *  - cabinetApi.clubManagerTeam(clubId) -> Команда
 *  - rolesApi.list({clubId, role:"CLUB_MANAGER"}) -> Управляющий (current +
 *    history, so restore has real data to work with — ClubManagerDashboardDTO
 *    itself doesn't carry "who manages this club", by design: a manager's
 *    OWN dashboard doesn't need to be told who they are).
 */
export function CityManagerClubDetail({ clubId }: { clubId: string }) {
  const router = useRouter();
  const [dashboard, setDashboard] = useState<ClubManagerDashboardDTO | null>(null);
  const [team, setTeam] = useState<CabinetTeamMemberDTO[] | null>(null);
  const [managerRows, setManagerRows] = useState<RoleAssignmentRowDTO[] | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "denied">("loading");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [previewingRole, setPreviewingRole] = useState(false);
  const [managerPosition, setManagerPosition] = useState<"" | "CLIENT_MANAGER" | "NIGHT_MANAGER" | "ADMINISTRATOR">("");

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
    } catch {
      setMsg("Не удалось отозвать назначение.");
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
      setMsg(e instanceof ApiError && e.code === "duplicate_active_assignment" ? "У клуба уже есть активный управляющий." : "Не удалось восстановить назначение.");
    } finally {
      setBusyId(null);
    }
  };

  const viewAsClubManager = async () => {
    setPreviewingRole(true);
    try {
      await viewAsApi.start({ role: "CLUB_MANAGER", clubId });
      router.push("/control/team");
    } catch {
      setPreviewingRole(false);
      setMsg("Не удалось начать предпросмотр.");
    }
  };
  const viewAsManager = async () => {
    if (!managerPosition) return;
    setPreviewingRole(true);
    try {
      await viewAsApi.start({ role: "MANAGER", clubId, previewPositionId: managerPosition });
      router.push("/home");
    } catch {
      setPreviewingRole(false);
      setMsg("Не удалось начать предпросмотр.");
    }
  };

  if (status === "denied") return <p className="text-sm text-muted-foreground">Клуб недоступен для вашей зоны ответственности.</p>;
  if (status === "error") {
    return (
      <div className="rounded-3xl border border-border bg-card p-6 text-center">
        <p className="text-sm text-red-500">Не удалось загрузить клуб.</p>
        <button onClick={load} className="mt-3 inline-flex items-center gap-1.5 rounded-2xl border border-border px-4 py-2 text-sm font-semibold">
          <RotateCw className="size-4" /> Повторить
        </button>
      </div>
    );
  }
  if (status === "loading" || !dashboard) return <DetailSkeleton />;

  return (
    <div>
      <h1 className="text-2xl font-bold">{dashboard.clubName ?? "Клуб"}</h1>
      {msg && <p className="mt-2 text-sm text-red-500">{msg}</p>}

      {/* ---- Просмотреть как (section 13 — View As, non-dominant) ---- */}
      <div className="mt-4 rounded-2xl border border-dashed border-border p-4">
        <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Eye className="size-3.5" /> Просмотреть как
        </p>
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <button
            onClick={viewAsClubManager}
            disabled={previewingRole}
            className="rounded-xl border border-border px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
          >
            {previewingRole ? "…" : "Управляющий"}
          </button>
          <select
            value={managerPosition}
            onChange={(e) => setManagerPosition(e.target.value as typeof managerPosition)}
            className="rounded-xl border border-border bg-background px-2.5 py-1.5 text-xs font-medium"
          >
            <option value="">Должность менеджера…</option>
            <option value="CLIENT_MANAGER">Менеджер по работе с клиентами</option>
            <option value="NIGHT_MANAGER">Ночной менеджер</option>
            <option value="ADMINISTRATOR">Администратор</option>
          </select>
          <button
            onClick={viewAsManager}
            disabled={previewingRole || !managerPosition}
            className="rounded-xl border border-border px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
          >
            {previewingRole ? "…" : "Менеджер"}
          </button>
        </div>
      </div>

      {/* ---- Общее ---- */}
      <Section title="Общее">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
          <SmallStat icon={Users} label="Сотрудников" value={dashboard.summary.employeeCount} />
          <SmallStat icon={Clock} label="Ожидают подтверждения" value={dashboard.summary.pendingApprovalCount} highlight={dashboard.summary.pendingApprovalCount > 0} />
        </div>
      </Section>

      {/* ---- Управляющий ---- */}
      <Section title="Управляющий">
        {currentManager ? (
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-border px-4 py-3">
            <div>
              <p className="text-sm font-semibold">{currentManager.userDisplayName}</p>
              <p className="text-xs text-muted-foreground">Назначен {new Date(currentManager.startedAt).toLocaleDateString("ru-RU")}</p>
            </div>
            <button
              onClick={() => revoke(currentManager.id)}
              disabled={busyId === currentManager.id}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
            >
              <ShieldOff className="size-3.5" /> {busyId === currentManager.id ? "…" : "Отозвать"}
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-border px-4 py-3">
            <p className="text-sm text-muted-foreground">Не назначен</p>
            <button
              onClick={() => setAssigning(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-3 py-1.5 text-xs font-semibold text-brand-foreground"
            >
              <UserCog className="size-3.5" /> Назначить управляющего
            </button>
          </div>
        )}

        {history.length > 0 && (
          <div className="mt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">История</p>
            <div className="mt-1.5 space-y-1.5">
              {history.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2 text-xs">
                  <span>
                    {r.userDisplayName} <span className="text-muted-foreground">· {r.status === "SUSPENDED" ? "Отозвано" : "Завершено"}</span>
                  </span>
                  {r.status === "SUSPENDED" && (
                    <button
                      onClick={() => restore(r.id)}
                      disabled={busyId === r.id || !canRestoreAssignment(Boolean(currentManager))}
                      className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 font-semibold disabled:opacity-50"
                    >
                      <RotateCw className="size-3" /> {busyId === r.id ? "…" : "Восстановить"}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </Section>

      {/* ---- Команда ---- */}
      <Section title="Команда">
        {!team || team.length === 0 ? (
          <p className="text-sm text-muted-foreground">В клубе пока нет сотрудников.</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-border">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2.5">Сотрудник</th>
                  <th className="px-3 py-2.5">Должность</th>
                  <th className="px-3 py-2.5">Доступ</th>
                  <th className="px-3 py-2.5">Обучение</th>
                </tr>
              </thead>
              <tbody>
                {team.map((m) => (
                  <tr key={m.userId} className="border-t border-border">
                    <td className="px-3 py-2 font-medium">{m.displayName}</td>
                    <td className="px-3 py-2 text-muted-foreground">{m.position ?? "—"}</td>
                    <td className="px-3 py-2">
                      <AccessBadge status={m.accessStatus} onboarded={m.onboardingCompleted} />
                    </td>
                    <td className="px-3 py-2 tabular-nums text-muted-foreground">
                      {m.academy.progressPercent != null ? `${m.academy.progressPercent}%` : "Нет данных"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* ---- Обучение ---- */}
      <Section title="Обучение">
        {dashboard.training ? (
          <div className="grid grid-cols-2 gap-3">
            <SmallStat icon={GraduationCap} label="Проходят обучение" value={dashboard.training.employeesInTraining} />
            <SmallStat icon={CheckCircle2} label="Завершили все опубликованные уроки" value={dashboard.training.employeesCompleted} />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Нет данных.</p>
        )}
      </Section>

      {/* ---- Требует внимания ---- */}
      <Section title="Требует внимания">
        {dashboard.attention.length === 0 ? (
          <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
            <CheckCircle2 className="size-4 text-success" /> Сейчас ничего не требует внимания.
          </div>
        ) : (
          <div className="space-y-1.5">
            {dashboard.attention.map((a) => (
              <div key={a.entityId} className="flex items-center gap-2.5 rounded-xl border border-border px-3 py-2 text-sm">
                <AlertCircle className="size-4 shrink-0 text-red-500" />
                {a.category === "PENDING_EMPLOYEE_APPROVAL" ? `${a.entityName} ожидает подтверждения` : a.entityName}
              </div>
            ))}
          </div>
        )}
      </Section>

      {assigning && (
        <ClubManagerAssignModal
          clubId={clubId}
          clubName={dashboard.clubName}
          onClose={() => setAssigning(false)}
          onAssigned={() => {
            setAssigning(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-6">
      <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">{title}</h2>
      <div className="mt-2.5 rounded-3xl border border-border bg-card p-4">{children}</div>
    </div>
  );
}

function SmallStat({
  icon: Icon,
  label,
  value,
  highlight,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div>
      <Icon className={cn("size-4", highlight && value > 0 ? "text-brand" : "text-muted-foreground")} />
      <p className="mt-1.5 text-xl font-bold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

const ACCESS_LABEL: Record<CabinetTeamMemberDTO["accessStatus"], string> = {
  LIMITED: "Базовый",
  PENDING_APPROVAL: "Ожидает",
  FULL: "Полный",
  SUSPENDED: "Приостановлен",
};

function AccessBadge({ status, onboarded }: { status: CabinetTeamMemberDTO["accessStatus"]; onboarded: boolean }) {
  if (!onboarded) return <span className="text-xs text-muted-foreground">Онбординг не завершён</span>;
  const cls =
    status === "SUSPENDED"
      ? "bg-red-500/10 text-red-500"
      : status === "PENDING_APPROVAL"
        ? "bg-brand/15 text-brand-strong"
        : status === "FULL"
          ? "bg-success-soft text-success"
          : "bg-muted text-muted-foreground";
  return <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-semibold", cls)}>{ACCESS_LABEL[status]}</span>;
}

function DetailSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-7 w-48 animate-pulse rounded-xl bg-muted" />
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-24 animate-pulse rounded-3xl bg-muted" />
      ))}
    </div>
  );
}
