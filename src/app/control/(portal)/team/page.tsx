"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { managerApi } from "@/lib/api/club-plan-client";
import { ApiError } from "@/lib/api/client";
import type { AccessStatusDTO, ClubTeamDTO } from "@/lib/api/club-plan-types";
import { ClubScopePicker } from "@/components/control/ClubScopePicker";

const ACCESS_LABEL: Record<AccessStatusDTO, string> = {
  LIMITED: "Ограниченный доступ",
  PENDING_APPROVAL: "Ожидает подтверждения",
  FULL: "Полный доступ",
  SUSPENDED: "Доступ приостановлен",
};

export default function ControlTeamPage() {
  const [team, setTeam] = useState<ClubTeamDTO | null>(null);
  const [clubId, setClubId] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "denied">("loading");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(() => {
    managerApi
      .team(clubId)
      .then((t) => { setTeam(t); setStatus("ready"); })
      .catch((e) => setStatus(e instanceof ApiError && (e.status === 403 || e.status === 401) ? "denied" : "error"));
  }, [clubId]);
  useEffect(() => { load(); }, [load]);

  const grantFull = async (userId: string) => {
    setBusyId(userId); setMsg(null);
    try {
      const res = await managerApi.setAccess(userId, "FULL", clubId);
      setTeam((t) => t ? { ...t, members: t.members.map((m) => (m.userId === userId ? { ...m, accessStatus: res.accessStatus } : m)) } : t);
    } catch (e) {
      setMsg(e instanceof ApiError ? "Не удалось изменить доступ." : "Ошибка.");
    } finally {
      setBusyId(null);
    }
  };

  const scope = team?.scope;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Команда</h1>
          <p className="mt-1 text-sm text-muted-foreground">{team?.clubName ?? (scope?.canSwitch ? "Выберите клуб" : "Ваш клуб")}</p>
        </div>
        {scope?.canSwitch && <ClubScopePicker scope={scope} value={clubId ?? scope.clubId} onChange={setClubId} />}
      </div>

      {status === "denied" && <p className="mt-6 text-sm text-red-500">Нет доступа к управлению клубом.</p>}
      {status === "error" && <p className="mt-6 text-sm text-red-500">Не удалось загрузить команду.</p>}
      {msg && <p className="mt-4 text-sm text-red-500">{msg}</p>}

      {status === "ready" && team && !team.clubId && (
        <div className="mt-6 rounded-3xl border border-dashed border-border bg-card/50 p-10 text-center">
          {scope?.canSwitch ? (
            <>
              <p className="font-semibold">Выберите клуб</p>
              <p className="mt-1 text-sm text-muted-foreground">Как администратор выберите клуб выше, чтобы увидеть его команду.</p>
            </>
          ) : (
            <>
              <p className="font-semibold">Учётная запись не привязана к клубу</p>
              <p className="mt-1 text-sm text-muted-foreground">Обратитесь к администратору, чтобы указать клуб в профиле.</p>
            </>
          )}
        </div>
      )}

      {status === "ready" && team && team.clubId && (
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
                      {ACCESS_LABEL[m.accessStatus]}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {m.accessStatus !== "FULL" && (
                      <button
                        onClick={() => grantFull(m.userId)}
                        disabled={busyId === m.userId}
                        className="rounded-xl bg-brand px-3 py-1.5 text-xs font-semibold text-brand-foreground disabled:opacity-50"
                      >
                        {busyId === m.userId ? "…" : "Предоставить полный доступ"}
                      </button>
                    )}
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
