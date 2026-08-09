"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BookOpen, FileText, Film, GraduationCap } from "lucide-react";
import { adminApi, type AdminDashboard } from "@/lib/api/content-client";

export default function AdminOverviewPage() {
  const [data, setData] = useState<AdminDashboard | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    adminApi.dashboard().then(setData).catch(() => setError(true));
  }, []);

  const stat = (label: string, value: number | string, Icon: typeof BookOpen) => (
    <div className="rounded-3xl border border-border bg-card p-5">
      <span className="flex size-9 items-center justify-center rounded-2xl bg-brand/12">
        <Icon className="size-5 text-brand" />
      </span>
      <p className="mt-3 text-2xl font-bold">{value}</p>
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );

  return (
    <div>
      <h1 className="text-2xl font-bold">Обзор</h1>
      <p className="mt-1 text-sm text-muted-foreground">Платформа обучения Metro UP</p>

      {error && <p className="mt-6 text-sm text-red-500">Нет доступа или сервер недоступен.</p>}

      {data && (
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {stat("Программы", data.totals.programs, GraduationCap)}
          {stat("Опубликовано уроков", data.totals.lessonsPublished, BookOpen)}
          {stat("Черновики уроков", data.totals.lessonsDraft, FileText)}
          {stat("Медиа-файлы", data.totals.media, Film)}
        </div>
      )}

      <Link
        href="/admin/content"
        className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-brand px-5 py-3 text-sm font-semibold text-brand-foreground"
      >
        Перейти к обучению
      </Link>
    </div>
  );
}
