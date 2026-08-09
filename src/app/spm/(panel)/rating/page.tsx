"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Calculator, RotateCcw, Rocket } from "lucide-react";
import { spmApi, type PeriodRef } from "@/lib/api/spm-client";
import { ApiError } from "@/lib/api/client";
import type { SpmRatingViewDTO } from "@/lib/api/spm-types";
import { prevCalendarMonth } from "@/lib/spm-period";
import { SpmToolbar } from "@/components/spm/SpmToolbar";

const STATUS_LABEL: Record<string, string> = { DRAFT: "Черновик", READY: "Готов к публикации", PUBLISHED: "Опубликован" };

export default function SpmRatingPage() {
  const [period, setPeriod] = useState<PeriodRef>(prevCalendarMonth());
  const [view, setView] = useState<SpmRatingViewDTO | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      setView(await spmApi.rating(period));
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, [period]);
  useEffect(() => { void load(); }, [load]);

  const flash = (t: string) => { setMsg(t); setTimeout(() => setMsg(null), 3500); };
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try { await fn(); await load(); flash(ok); }
    catch (e) { flash(e instanceof ApiError ? errorText(e.code) : "Ошибка"); }
    finally { setBusy(false); }
  };

  const r = view?.readiness;
  const stat = (label: string, value: number | string) => (
    <div className="rounded-2xl border border-border bg-card p-4"><p className="text-xl font-bold">{value}</p><p className="text-xs text-muted-foreground">{label}</p></div>
  );

  return (
    <div>
      <h1 className="text-2xl font-bold">Рейтинг</h1>
      <div className="mt-5"><SpmToolbar period={period} onPeriod={setPeriod} showFilters={false} /></div>
      {msg && <div className="mt-3 rounded-2xl bg-brand/12 px-4 py-2 text-sm">{msg}</div>}
      {status === "error" && <p className="mt-6 text-sm text-red-500">Не удалось загрузить.</p>}

      {status === "ready" && view && (
        <>
          <div className="mt-4 flex items-center gap-3">
            <span className="rounded-full bg-muted px-3 py-1 text-sm font-semibold">{STATUS_LABEL[view.period.status]}</span>
            <span className="text-sm text-muted-foreground">{view.period.label}</span>
          </div>

          {r && (
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {stat("Eligible", r.eligibleCount)}
              {stat("Готовы", r.readyCount)}
              {stat("Нет продаж", r.missingSales)}
              {stat("Нет mystery", r.missingMystery)}
              {stat("Исключены", r.excludedCount)}
            </div>
          )}

          <div className="mt-5 flex flex-wrap gap-3">
            <button disabled={busy || !view.canCalculate} onClick={() => run(() => spmApi.calculate(period), "Рейтинг рассчитан")}
              className="flex items-center gap-1.5 rounded-2xl bg-foreground px-5 py-2.5 text-sm font-semibold text-background disabled:opacity-40">
              <Calculator className="size-4" /> Рассчитать рейтинг
            </button>
            <button disabled={busy || !view.canPublish}
              onClick={() => { if (confirm(`После публикации сотрудники увидят рейтинг за ${view.period.label}.`)) run(() => spmApi.publish(period), "Рейтинг опубликован"); }}
              className="flex items-center gap-1.5 rounded-2xl bg-brand px-5 py-2.5 text-sm font-semibold text-brand-foreground disabled:opacity-40">
              <Rocket className="size-4" /> Опубликовать рейтинг
            </button>
            {view.period.status === "PUBLISHED" && (
              <button disabled={busy} onClick={() => { if (confirm("Вернуть период в работу? Сотрудники перестанут видеть рейтинг до повторной публикации.")) run(() => spmApi.reopen(period), "Возвращено в работу"); }}
                className="flex items-center gap-1.5 rounded-2xl border border-border px-4 py-2.5 text-sm font-semibold hover:bg-muted disabled:opacity-40">
                <RotateCcw className="size-4" /> Вернуть в работу
              </button>
            )}
          </div>

          <div className="mt-6 overflow-x-auto rounded-3xl border border-border">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">#</th><th className="px-4 py-3">Сотрудник</th><th className="px-4 py-3">Клуб</th>
                  <th className="px-4 py-3">Sales %</th><th className="px-4 py-3">Mystery</th><th className="px-4 py-3">Final</th><th className="px-4 py-3">Δ</th>
                </tr>
              </thead>
              <tbody>
                {view.rows.map((row) => (
                  <tr key={row.employeeUserId} className="border-t border-border">
                    <td className="px-4 py-2.5 font-bold">{row.rank}</td>
                    <td className="px-4 py-2.5 font-medium">{row.displayName}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{row.clubName ?? "—"}</td>
                    <td className="px-4 py-2.5">{row.salesScore.toFixed(1)}</td>
                    <td className="px-4 py-2.5">{row.mysteryScore.toFixed(1)}</td>
                    <td className="px-4 py-2.5 font-bold">{row.finalScore.toFixed(1)}</td>
                    <td className="px-4 py-2.5">
                      {row.delta == null || row.delta === 0 ? <span className="text-muted-foreground">—</span> : (
                        <span className={`inline-flex items-center gap-0.5 font-semibold ${row.delta > 0 ? "text-success" : "text-red-500"}`}>
                          {row.delta > 0 ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />}{Math.abs(row.delta)}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
                {view.rows.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">Рейтинг ещё не рассчитан</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function errorText(code: string): string {
  const map: Record<string, string> = {
    period_published: "Период опубликован — верните в работу",
    period_not_completed: "Нельзя публиковать незавершённый месяц",
    not_ready: "Сначала рассчитайте рейтинг",
    not_published: "Период не опубликован",
  };
  return map[code] ?? "Ошибка операции";
}
