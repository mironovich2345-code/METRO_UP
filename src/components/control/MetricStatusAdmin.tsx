"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, FileText, Loader2, RefreshCw, XCircle } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { metricApi } from "@/lib/api/metric-client";
import type { MetricStatusDTO, MetricSourceTypeDTO } from "@/lib/api/metric-types";

const SOURCE_LABEL: Record<MetricSourceTypeDTO, string> = {
  ACADEMY: "Академия", SCRIPT: "Скрипты", INSTRUCTION: "Инструкции", DOCUMENT: "Документы",
};

export function MetricStatusAdmin() {
  const [data, setData] = useState<MetricStatusDTO | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "denied" | "error">("loading");
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setData(await metricApi.status()); setStatus("ready"); }
    catch (e) { setStatus(e instanceof ApiError && (e.status === 403 || e.status === 401) ? "denied" : "error"); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const resync = async () => {
    setSyncing(true); setMsg(null);
    try {
      const r = await metricApi.sync();
      setMsg(`Синхронизировано: ${r.synced}, удалено: ${r.removed}.`);
      await load();
    } catch (e) {
      if (e instanceof ApiError && e.code === "no_api_key") setMsg("Не задан OPENAI_API_KEY.");
      else if (e instanceof ApiError && e.code === "no_vector_store") setMsg("Не задан OPENAI_VECTOR_STORE_ID (создайте через npm run metric:sync).");
      else setMsg("Не удалось синхронизировать.");
    } finally { setSyncing(false); }
  };

  if (status === "denied") return <p className="text-sm text-muted-foreground">Недостаточно прав.</p>;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Метрик — база знаний</h1>
          <p className="mt-1 text-sm text-muted-foreground">Статус синхронизации опубликованных материалов с ИИ-помощником.</p>
        </div>
        <Link href="/control/metric/documents" className="flex items-center gap-1.5 rounded-2xl border border-border px-4 py-2.5 text-sm font-semibold hover:bg-muted">
          <FileText className="size-4" /> Документы
        </Link>
      </div>

      {status === "loading" && <div className="mt-6 h-40 animate-pulse rounded-3xl bg-muted" />}
      {status === "error" && <p className="mt-6 text-sm text-red-500">Не удалось загрузить статус.</p>}

      {status === "ready" && data && (
        <>
          <div className="mt-6 flex flex-wrap gap-3">
            <Flag ok={data.enabled} label={data.enabled ? "Метрик включён" : "Метрик выключен"} />
            <Flag ok={data.hasApiKey} label={data.hasApiKey ? "API-ключ задан" : "Нет API-ключа"} />
            <Flag ok={data.hasVectorStore} label={data.hasVectorStore ? "Хранилище задано" : "Нет хранилища"} />
            <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">Модель: {data.model}</span>
          </div>

          <div className="mt-5 overflow-x-auto rounded-3xl border border-border">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Источник</th>
                  <th className="px-4 py-3 font-medium">Синхронизировано</th>
                  <th className="px-4 py-3 font-medium">Ожидает</th>
                  <th className="px-4 py-3 font-medium">Ошибки</th>
                </tr>
              </thead>
              <tbody>
                {(Object.keys(SOURCE_LABEL) as MetricSourceTypeDTO[]).map((k) => (
                  <tr key={k} className="border-t border-border">
                    <td className="px-4 py-3 font-medium">{SOURCE_LABEL[k]}</td>
                    <td className="px-4 py-3">{data.bySource[k].synced}</td>
                    <td className="px-4 py-3 text-muted-foreground">{data.bySource[k].pending}</td>
                    <td className={`px-4 py-3 ${data.bySource[k].failed ? "font-semibold text-red-500" : "text-muted-foreground"}`}>{data.bySource[k].failed}</td>
                  </tr>
                ))}
                <tr className="border-t border-border bg-muted/30 font-semibold">
                  <td className="px-4 py-3">Итого</td>
                  <td className="px-4 py-3">{data.totals.synced}</td>
                  <td className="px-4 py-3">{data.totals.pending}</td>
                  <td className={`px-4 py-3 ${data.totals.failed ? "text-red-500" : ""}`}>{data.totals.failed}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {msg && <p className="mt-4 rounded-2xl bg-muted px-4 py-2.5 text-sm text-muted-foreground">{msg}</p>}

          <button
            onClick={resync}
            disabled={syncing || !data.hasApiKey || !data.hasVectorStore}
            className="mt-4 flex items-center gap-2 rounded-2xl bg-brand px-5 py-2.5 text-sm font-semibold text-brand-foreground disabled:opacity-50"
          >
            {syncing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            {syncing ? "Синхронизация…" : "Повторить синхронизацию"}
          </button>
          {(!data.hasApiKey || !data.hasVectorStore) && (
            <p className="mt-2 text-xs text-muted-foreground">Синхронизация доступна после настройки ключа и хранилища на Railway (см. npm run metric:sync).</p>
          )}
        </>
      )}
    </div>
  );
}

function Flag({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${ok ? "bg-success-soft text-success" : "bg-muted text-muted-foreground"}`}>
      {ok ? <CheckCircle2 className="size-3.5" /> : <XCircle className="size-3.5" />} {label}
    </span>
  );
}
