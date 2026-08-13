"use client";

import { useCallback, useEffect, useState } from "react";
import { X } from "lucide-react";
import { spmApi, type PeriodRef, type SpmFilters } from "@/lib/api/spm-client";
import { ApiError } from "@/lib/api/client";
import type { SpmMysteryRowDTO } from "@/lib/api/spm-types";
import { prevCalendarMonth } from "@/lib/spm-period";
import { SpmToolbar } from "@/components/spm/SpmToolbar";
import { fieldCls } from "@/components/admin/ui";

const STATUS: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: "Черновик", cls: "bg-muted text-muted-foreground" },
  PUBLISHED: { label: "Опубликован", cls: "bg-success-soft text-success" },
};

export default function SpmMysteryPage() {
  const [period, setPeriod] = useState<PeriodRef>(prevCalendarMonth());
  const [filters, setFilters] = useState<SpmFilters>({});
  const [rows, setRows] = useState<SpmMysteryRowDTO[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [editing, setEditing] = useState<SpmMysteryRowDTO | null>(null);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const { rows } = await spmApi.mystery(period, filters);
      setRows(rows);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, [period, filters]);

  useEffect(() => {
    const t = setTimeout(load, filters.search ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, filters.search]);

  return (
    <div>
      <h1 className="text-2xl font-bold">Тайный покупатель</h1>
      <p className="mt-1 text-sm text-muted-foreground">Оценка 0–100. Сотрудник видит только опубликованный результат.</p>

      <div className="mt-5"><SpmToolbar period={period} onPeriod={setPeriod} filters={filters} onFilters={setFilters} /></div>

      {status === "error" && <p className="mt-6 text-sm text-red-500">Не удалось загрузить.</p>}

      {status === "ready" && (
        <div className="mt-4 overflow-x-auto rounded-3xl border border-border">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Сотрудник</th>
                <th className="px-4 py-3">Клуб</th>
                <th className="px-4 py-3">Оценка</th>
                <th className="px-4 py-3">Дата проверки</th>
                <th className="px-4 py-3">Комментарий</th>
                <th className="px-4 py-3">Статус</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.employeeUserId} className="border-t border-border">
                  <td className="px-4 py-2.5 font-medium">{r.displayName}<span className="block text-xs text-muted-foreground">{r.positionTitle} · {r.cityName}</span></td>
                  <td className="px-4 py-2.5 text-muted-foreground">{r.clubName ?? "—"}</td>
                  <td className="px-4 py-2.5 font-semibold">{r.score ?? "—"}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{r.checkedAt ? new Date(r.checkedAt).toLocaleDateString("ru-RU") : "—"}</td>
                  <td className="px-4 py-2.5 max-w-[220px] truncate text-muted-foreground">{r.comment ?? "—"}</td>
                  <td className="px-4 py-2.5">{r.status ? <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS[r.status].cls}`}>{STATUS[r.status].label}</span> : <span className="text-xs text-muted-foreground">нет</span>}</td>
                  <td className="px-4 py-2.5"><button onClick={() => setEditing(r)} className="rounded-xl border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted">{r.status === "PUBLISHED" ? "Открыть" : "Ввести"}</button></td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">Нет сотрудников по фильтру</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <MysteryModal row={editing} period={period} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await load(); }} />
      )}
    </div>
  );
}

function MysteryModal({ row, period, onClose, onSaved }: { row: SpmMysteryRowDTO; period: PeriodRef; onClose: () => void; onSaved: () => void }) {
  const published = row.status === "PUBLISHED";
  const [score, setScore] = useState(row.score != null ? String(row.score) : "");
  const [checkedAt, setCheckedAt] = useState(row.checkedAt ? row.checkedAt.slice(0, 10) : "");
  const [comment, setComment] = useState(row.comment ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (thenPublish: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const { row: saved } = await spmApi.saveMystery({
        employeeUserId: row.employeeUserId, month: period.month, year: period.year,
        score: Number(score), checkedAt: checkedAt ? new Date(checkedAt).toISOString() : null, comment: comment || null,
      });
      if (thenPublish && !confirm("Опубликовать результат? Сотрудник увидит его на Home.")) { setBusy(false); return; }
      if (thenPublish) await spmApi.publishMystery(saved.id);
      onSaved();
    } catch (e) {
      setError(e instanceof ApiError ? (e.code === "invalid_score" ? "Оценка 0–100" : e.code === "already_published" ? "Уже опубликовано" : "Ошибка") : "Ошибка");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl border border-border bg-card p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">{row.displayName}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-muted"><X className="size-4" /></button>
        </div>
        <p className="text-sm text-muted-foreground">{row.clubName} · период {period.month}/{period.year}</p>

        <div className="mt-4 space-y-3">
          <label className="block"><span className="mb-1 block text-xs font-medium text-muted-foreground">Оценка (0–100)</span>
            <input inputMode="numeric" className={fieldCls} value={score} disabled={published} onChange={(e) => setScore(e.target.value.replace(/\D/g, "").slice(0, 3))} /></label>
          <label className="block"><span className="mb-1 block text-xs font-medium text-muted-foreground">Дата проверки</span>
            <input type="date" className={fieldCls} value={checkedAt} disabled={published} onChange={(e) => setCheckedAt(e.target.value)} /></label>
          <label className="block"><span className="mb-1 block text-xs font-medium text-muted-foreground">Комментарий</span>
            <textarea className={fieldCls + " min-h-20"} value={comment} disabled={published} onChange={(e) => setComment(e.target.value)} /></label>
        </div>

        {error && <p className="mt-3 text-sm text-red-500">{error}</p>}

        {published ? (
          <p className="mt-4 rounded-2xl bg-success-soft px-4 py-2 text-sm text-success">Результат опубликован — сотрудник его видит.</p>
        ) : (
          <div className="mt-5 flex gap-2">
            <button onClick={() => save(false)} disabled={busy || !score} className="rounded-2xl border border-border px-4 py-2.5 text-sm font-semibold hover:bg-muted disabled:opacity-50">Сохранить черновик</button>
            <button onClick={() => save(true)} disabled={busy || !score} className="rounded-2xl bg-brand px-4 py-2.5 text-sm font-semibold text-brand-foreground disabled:opacity-50">Опубликовать</button>
          </div>
        )}
      </div>
    </div>
  );
}
