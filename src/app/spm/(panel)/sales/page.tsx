"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { spmApi, type PeriodRef, type SpmFilters } from "@/lib/api/spm-client";
import { ApiError } from "@/lib/api/client";
import type { SpmSalesRowDTO } from "@/lib/api/spm-types";
import { prevCalendarMonth } from "@/lib/spm-period";
import { SpmToolbar } from "@/components/spm/SpmToolbar";
import { fieldCls } from "@/components/admin/ui";

type Edit = { plan: string; fact: string };

function preview(plan: number, fact: number): string {
  if (!(plan > 0)) return "—";
  return Math.min((fact / plan) * 100, 120).toFixed(1) + "%";
}

export default function SpmSalesPage() {
  const [period, setPeriod] = useState<PeriodRef>(prevCalendarMonth());
  const [filters, setFilters] = useState<SpmFilters>({});
  const [rows, setRows] = useState<SpmSalesRowDTO[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  const dirty = useMemo(() => Object.keys(edits).some((id) => {
    const r = rows.find((x) => x.employeeUserId === id);
    if (!r) return false;
    return String(r.personalPlan ?? "") !== edits[id].plan || String(r.personalFact ?? "") !== edits[id].fact;
  }), [edits, rows]);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const { rows } = await spmApi.sales(period, filters);
      setRows(rows);
      setEdits(Object.fromEntries(rows.map((r) => [r.employeeUserId, { plan: String(r.personalPlan ?? ""), fact: String(r.personalFact ?? "") }])));
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, [period, filters]);

  useEffect(() => {
    const t = setTimeout(load, filters.search ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, filters.search]);

  const saveRow = async (r: SpmSalesRowDTO) => {
    const e = edits[r.employeeUserId];
    const plan = Number(e.plan || 0);
    const fact = Number(e.fact || 0);
    setSaving((s) => ({ ...s, [r.employeeUserId]: true }));
    setError(null);
    try {
      await spmApi.saveSales({ employeeUserId: r.employeeUserId, month: period.month, year: period.year, personalPlan: plan, personalFact: fact });
      setRows((rs) => rs.map((x) => x.employeeUserId === r.employeeUserId
        ? { ...x, personalPlan: plan, personalFact: fact, salesScore: plan > 0 ? Math.min((fact / plan) * 100, 120) : null } : x));
      setSaved((s) => ({ ...s, [r.employeeUserId]: true }));
      setTimeout(() => setSaved((s) => ({ ...s, [r.employeeUserId]: false })), 1500);
    } catch (err) {
      setError(err instanceof ApiError && err.code === "period_published" ? "Период опубликован — верните в работу" : "Ошибка сохранения");
    } finally {
      setSaving((s) => ({ ...s, [r.employeeUserId]: false }));
    }
  };

  const changePeriod = (p: PeriodRef) => {
    if (dirty && !confirm("Есть несохранённые изменения. Переключить период?")) return;
    setPeriod(p);
  };

  return (
    <div>
      <h1 className="text-2xl font-bold">Продажи</h1>
      <p className="mt-1 text-sm text-muted-foreground">План и факт вносятся вручную; выполнение считает система (макс. 120%).</p>

      <div className="mt-5">
        <SpmToolbar period={period} onPeriod={changePeriod} filters={filters} onFilters={setFilters} />
      </div>

      {dirty && <p className="mt-3 text-sm text-brand">Есть несохранённые изменения</p>}
      {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
      {status === "error" && <p className="mt-6 text-sm text-red-500">Не удалось загрузить.</p>}

      {status === "ready" && (
        <div className="mt-4 overflow-x-auto rounded-3xl border border-border">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Сотрудник</th>
                <th className="px-4 py-3">Клуб</th>
                <th className="px-4 py-3">Личный план, ₽</th>
                <th className="px-4 py-3">Факт, ₽</th>
                <th className="px-4 py-3">Выполнение</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const e = edits[r.employeeUserId] ?? { plan: "", fact: "" };
                return (
                  <tr key={r.employeeUserId} className="border-t border-border">
                    <td className="px-4 py-2.5 font-medium">
                      {r.displayName}
                      <span className="block text-xs text-muted-foreground">{r.positionTitle} · {r.cityName}</span>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{r.clubName ?? "—"}</td>
                    <td className="px-4 py-2.5">
                      <input inputMode="numeric" className={fieldCls + " w-32"} value={e.plan}
                        onChange={(ev) => setEdits((s) => ({ ...s, [r.employeeUserId]: { ...e, plan: ev.target.value.replace(/\D/g, "") } }))} />
                    </td>
                    <td className="px-4 py-2.5">
                      <input inputMode="numeric" className={fieldCls + " w-32"} value={e.fact}
                        onChange={(ev) => setEdits((s) => ({ ...s, [r.employeeUserId]: { ...e, fact: ev.target.value.replace(/\D/g, "") } }))} />
                    </td>
                    <td className="px-4 py-2.5 font-semibold">{preview(Number(e.plan || 0), Number(e.fact || 0))}</td>
                    <td className="px-4 py-2.5">
                      <button onClick={() => saveRow(r)} disabled={saving[r.employeeUserId]}
                        className="flex items-center gap-1 rounded-xl bg-foreground px-3 py-1.5 text-xs font-semibold text-background disabled:opacity-50">
                        {saving[r.employeeUserId] ? <Loader2 className="size-3.5 animate-spin" /> : saved[r.employeeUserId] ? <Check className="size-3.5" /> : null}
                        {saved[r.employeeUserId] ? "Сохранено" : "Сохранить"}
                      </button>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">Нет сотрудников по фильтру</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
