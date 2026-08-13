"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, BarChart3, Eye, GraduationCap, Image as ImageIcon, Trophy } from "lucide-react";
import type { AppRole } from "@prisma/client";
import { canAccessAdmin } from "@/lib/roles";
import { adminApi, type AdminDashboard } from "@/lib/api/content-client";

interface CardDef {
  key: string;
  title: string;
  description: string;
  href: string;
  cta: string;
  icon: typeof BarChart3;
  adminOnly?: boolean;
}

const CARDS: CardDef[] = [
  { key: "learning", title: "Обучение", description: "Создание уроков, видео, материалов и тестов", href: "/admin/content", cta: "Открыть обучение", icon: GraduationCap, adminOnly: true },
  { key: "sales", title: "Продажи", description: "Личные планы и фактические продажи менеджеров", href: "/spm/sales", cta: "Открыть продажи", icon: BarChart3 },
  { key: "mystery", title: "Тайный покупатель", description: "Результаты проверок и обратная связь", href: "/spm/mystery", cta: "Открыть проверки", icon: Eye },
  { key: "rating", title: "Рейтинг", description: "Расчёт и публикация месячного рейтинга", href: "/spm/rating", cta: "Открыть рейтинг", icon: Trophy },
  { key: "media", title: "Медиа", description: "Видео и изображения учебной платформы", href: "/admin/media", cta: "Открыть медиа", icon: ImageIcon, adminOnly: true },
];

export function ControlDashboard({ displayName, role }: { displayName: string; role: AppRole }) {
  const isAdmin = canAccessAdmin(role);
  const [dash, setDash] = useState<AdminDashboard | null>(null);

  useEffect(() => {
    if (isAdmin) adminApi.dashboard().then(setDash).catch(() => setDash(null));
  }, [isAdmin]);

  const cards = CARDS.filter((c) => !c.adminOnly || isAdmin);

  return (
    <div>
      <h1 className="text-2xl font-bold">METRO UP Control</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Управление обучением и результатами команды · {displayName} ({role === "ADMIN" ? "Администратор" : "СПМ"})
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Link
              key={c.key}
              href={c.href}
              className="group flex flex-col rounded-3xl border border-border bg-card p-6 transition-colors hover:border-brand/40"
            >
              <span className="flex size-11 items-center justify-center rounded-2xl bg-brand/12">
                <Icon className="size-5 text-brand" />
              </span>
              <p className="mt-4 text-lg font-bold">{c.title}</p>
              <p className="mt-1 flex-1 text-sm text-muted-foreground">{c.description}</p>

              {c.key === "learning" && dash && (
                <div className="mt-3 flex gap-4 text-xs text-muted-foreground">
                  <span><b className="text-foreground">{dash.totals.programs}</b> программ</span>
                  <span><b className="text-foreground">{dash.totals.lessonsPublished}</b> опубл.</span>
                  <span><b className="text-foreground">{dash.totals.lessonsDraft}</b> черновиков</span>
                </div>
              )}

              <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-brand">
                {c.cta} <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
