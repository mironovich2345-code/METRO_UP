"use client";

import { useEffect, useState } from "react";
import { managerApi } from "@/lib/api/club-plan-client";
import { ApiError } from "@/lib/api/client";
import type { ClubTeamDTO } from "@/lib/api/club-plan-types";

export default function ControlTeamPage() {
  const [team, setTeam] = useState<ClubTeamDTO | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "denied">("loading");

  useEffect(() => {
    managerApi
      .team()
      .then((t) => { setTeam(t); setStatus("ready"); })
      .catch((e) => setStatus(e instanceof ApiError && (e.status === 403 || e.status === 401) ? "denied" : "error"));
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold">Команда</h1>
      <p className="mt-1 text-sm text-muted-foreground">{team?.clubName ?? "Ваш клуб"}</p>

      {status === "denied" && <p className="mt-6 text-sm text-red-500">Нет доступа к управлению клубом.</p>}
      {status === "error" && <p className="mt-6 text-sm text-red-500">Не удалось загрузить команду.</p>}

      {status === "ready" && team && !team.clubId && (
        <div className="mt-6 rounded-3xl border border-dashed border-border bg-card/50 p-10 text-center">
          <p className="font-semibold">Учётная запись не привязана к клубу</p>
          <p className="mt-1 text-sm text-muted-foreground">Обратитесь к администратору, чтобы указать клуб в профиле.</p>
        </div>
      )}

      {status === "ready" && team && team.clubId && (
        <div className="mt-6 overflow-x-auto rounded-3xl border border-border">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Сотрудник</th>
                <th className="px-4 py-3">Должность</th>
                <th className="px-4 py-3">План сегодня</th>
                <th className="px-4 py-3">Уроков пройдено</th>
              </tr>
            </thead>
            <tbody>
              {team.members.map((m) => (
                <tr key={m.userId} className="border-t border-border">
                  <td className="px-4 py-2.5 font-medium">{m.displayName}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{m.positionTitle ?? "—"}</td>
                  <td className="px-4 py-2.5">{m.planCompleted}/{m.planTotal}</td>
                  <td className="px-4 py-2.5">{m.lessonsCompleted}</td>
                </tr>
              ))}
              {team.members.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">В клубе нет сотрудников.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
