"use client";

import { useState } from "react";
import { controlAdminApi } from "@/lib/api/control-admin-client";
import type { TelemetryPeriodDays } from "@/lib/api/telemetry-types";
import { formatCount } from "@/lib/control/telemetry-view";
import { DashboardStat } from "./dashboard-card";
import { PeriodToggle, ScreenList, usePeriodData } from "./TelemetryCards";

const loadVisits = (d: TelemetryPeriodDays, s: AbortSignal) => controlAdminApi.visits(d, 20, s);

/**
 * Sprint: LIVE QA QA-07 — «Посещаемость» (PROJECT_ADMIN only): aggregate
 * screen visits for 7/30 days — totals, by app and the top screens. No
 * per-user history (not a v1 feature).
 */
export function VisitsAdmin() {
  const [days, setDays] = useState<TelemetryPeriodDays>(30);
  const { data, error } = usePeriodData(loadVisits, days);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">Посещаемость</h1>
          <p className="mt-1 text-sm text-muted-foreground">Переходы на экраны Mini App, Control и СПМ.</p>
        </div>
        <PeriodToggle value={days} onChange={setDays} />
      </div>

      {!data ? (
        <p className="text-sm text-muted-foreground">{error ? "Не удалось загрузить посещаемость." : "Загрузка…"}</p>
      ) : (
        <>
          <section className="rounded-3xl border border-border bg-card p-5">
            <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2">
              <DashboardStat label="просмотров экранов" value={formatCount(data.totalViews)} />
              <DashboardStat label="уникальных пользователей" value={formatCount(data.uniqueUsers)} />
            </div>
            {data.bySurface.length > 0 && (
              <ul className="mt-4 flex flex-wrap gap-2">
                {data.bySurface.map((s) => (
                  <li key={s.key} className="rounded-2xl bg-muted px-3 py-1.5 text-xs font-semibold">
                    {s.label}: {formatCount(s.views)} · {formatCount(s.uniqueUsers)} чел.
                  </li>
                ))}
              </ul>
            )}
            {data.trackingSince && new Date(data.trackingSince) > new Date(data.since) && (
              <p className="mt-3 text-sm text-muted-foreground">
                Учёт ведётся с {new Date(data.trackingSince).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}
              </p>
            )}
            {!data.trackingSince && <p className="mt-3 text-sm text-muted-foreground">Учёт ведётся с момента обновления — данных пока нет</p>}
          </section>
          <section className="rounded-3xl border border-border bg-card p-5">
            <h2 className="text-lg font-bold">Популярные экраны</h2>
            <div className="mt-3">
              <ScreenList rows={data.topScreens} />
            </div>
          </section>
        </>
      )}
    </div>
  );
}
