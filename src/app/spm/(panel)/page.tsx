"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BarChart3, CheckCircle2, Eye, Trophy, Users } from "lucide-react";
import { spmApi } from "@/lib/api/spm-client";
import type { SpmOverviewDTO } from "@/lib/api/spm-types";

const STATUS_LABEL: Record<string, string> = { DRAFT: "Черновик", READY: "Готов к публикации", PUBLISHED: "Опубликован" };

export default function SpmOverviewPage() {
  const [data, setData] = useState<SpmOverviewDTO | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    spmApi.overview().then((d) => { setData(d); setStatus("ready"); }).catch(() => setStatus("error"));
  }, []);

  const card = (label: string, value: string, Icon: typeof Users, sub?: string) => (
    <div className="rounded-3xl border border-border bg-card p-5">
      <span className="flex size-9 items-center justify-center rounded-2xl bg-brand/12"><Icon className="size-5 text-brand" /></span>
      <p className="mt-3 text-2xl font-bold">{value}</p>
      <p className="text-sm text-muted-foreground">{label}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );

  return (
    <div>
      <h1 className="text-2xl font-bold">Обзор</h1>
      {status === "error" && <p className="mt-6 text-sm text-red-500">Нет доступа или сервер недоступен.</p>}

      {status === "ready" && data && (
        <>
          <p className="mt-1 text-sm text-muted-foreground">
            Текущий период: <b>{data.currentLabel}</b>. Рейтинг формируем за <b>{data.workingPeriod.label}</b>.
          </p>

          <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
            {card("Сотрудников в рейтинге", String(data.eligibleCount), Users)}
            {card("Продажи заполнены", `${data.salesFilled}/${data.eligibleCount}`, BarChart3)}
            {card("Тайный покупатель", `${data.mysteryFilled}/${data.eligibleCount}`, Eye)}
            {card("Готово к расчёту", `${data.readyCount}/${data.eligibleCount}`, CheckCircle2)}
            {card("Статус рейтинга", STATUS_LABEL[data.workingPeriod.status] ?? data.workingPeriod.status, Trophy,
              data.published ? "Сотрудники видят рейтинг" : "Ещё не опубликован")}
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/spm/sales" className="rounded-2xl bg-brand px-5 py-2.5 text-sm font-semibold text-brand-foreground">Внести продажи</Link>
            <Link href="/spm/mystery" className="rounded-2xl border border-border px-5 py-2.5 text-sm font-semibold hover:bg-muted">Тайный покупатель</Link>
            <Link href="/spm/rating" className="rounded-2xl border border-border px-5 py-2.5 text-sm font-semibold hover:bg-muted">Рейтинг</Link>
          </div>
        </>
      )}
    </div>
  );
}
