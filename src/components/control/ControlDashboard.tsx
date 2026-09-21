"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, BarChart3, BookOpen, Bot, Building2, Eye, Globe2, GraduationCap, ListChecks, ScrollText, Trophy, UserCog, Users } from "lucide-react";
import type { AppRole } from "@prisma/client";
import { canAccessSpm, canManageClub } from "@/lib/roles";
import { adminApi, type AdminDashboard } from "@/lib/api/content-client";

interface CardCtx {
  role: AppRole;
  /** Legacy AppRole=ADMIN OR an active PROJECT_ADMIN/SYSTEM RoleAssignment
   * (Sprint 1 / Phase 2B) — computed once server-side, never re-derived from
   * `role` alone here. */
  hasSystemAccess: boolean;
  isCityManager: boolean;
  isOperationsDirector: boolean;
}

interface CardDef {
  key: string;
  title: string;
  description: string;
  href: string;
  cta: string;
  icon: typeof BarChart3;
  can: (ctx: CardCtx) => boolean;
}

const CARDS: CardDef[] = [
  { key: "learning", title: "Обучение", description: "Создание уроков, видео, материалов и тестов", href: "/admin/content", cta: "Открыть обучение", icon: GraduationCap, can: (c) => c.hasSystemAccess },
  { key: "scripts", title: "Скрипты", description: "Рабочие сценарии разговоров для менеджеров", href: "/control/scripts", cta: "Открыть скрипты", icon: ScrollText, can: (c) => c.hasSystemAccess },
  { key: "instructions", title: "Инструкции", description: "Регламенты и рабочие инструкции для смены", href: "/control/instructions", cta: "Открыть инструкции", icon: BookOpen, can: (c) => c.hasSystemAccess },
  { key: "users", title: "Сотрудники", description: "Роли, должности и клубы сотрудников", href: "/control/users", cta: "Открыть сотрудников", icon: UserCog, can: (c) => c.hasSystemAccess },
  { key: "roles", title: "Роли", description: "Назначение и отзыв ролей новой RBAC-иерархии", href: "/control/roles", cta: "Открыть роли", icon: UserCog, can: (c) => c.hasSystemAccess },
  { key: "metric", title: "Метрик", description: "Статус синхронизации базы знаний с ИИ-помощником", href: "/control/metric", cta: "Открыть Метрик", icon: Bot, can: (c) => c.hasSystemAccess },
  { key: "plan", title: "План дня", description: "Операционные задачи сотрудников вашего клуба", href: "/control/plan", cta: "Открыть план дня", icon: ListChecks, can: (c) => canManageClub(c.role) },
  { key: "team", title: "Команда", description: "Сотрудники клуба и их прогресс", href: "/control/team", cta: "Открыть команду", icon: Users, can: (c) => canManageClub(c.role) },
  { key: "city", title: "Мои клубы", description: "Клубы вашего города: управляющие и команды", href: "/control/city", cta: "Открыть клубы", icon: Building2, can: (c) => c.isCityManager },
  { key: "network", title: "Сеть", description: "Города и клубы сети METRO UP", href: "/control/network", cta: "Открыть сеть", icon: Globe2, can: (c) => c.isOperationsDirector },
  { key: "sales", title: "Продажи", description: "Личные планы и фактические продажи менеджеров", href: "/spm/sales", cta: "Открыть продажи", icon: BarChart3, can: (c) => canAccessSpm(c.role) },
  { key: "mystery", title: "Тайный покупатель", description: "Результаты проверок и обратная связь", href: "/spm/mystery", cta: "Открыть проверки", icon: Eye, can: (c) => canAccessSpm(c.role) },
  { key: "rating", title: "Рейтинг", description: "Расчёт и публикация месячного рейтинга", href: "/spm/rating", cta: "Открыть рейтинг", icon: Trophy, can: (c) => canAccessSpm(c.role) },
];

const ROLE_LABEL: Record<string, string> = { ADMIN: "Администратор", SPM: "СПМ", CLUB_MANAGER: "Управляющий" };

export function ControlDashboard({
  displayName,
  role,
  hasSystemAccess,
  isCityManager = false,
  isOperationsDirector = false,
}: {
  displayName: string;
  role: AppRole;
  hasSystemAccess: boolean;
  isCityManager?: boolean;
  isOperationsDirector?: boolean;
}) {
  const [dash, setDash] = useState<AdminDashboard | null>(null);

  useEffect(() => {
    if (hasSystemAccess) adminApi.dashboard().then(setDash).catch(() => setDash(null));
  }, [hasSystemAccess]);

  const cards = CARDS.filter((c) => c.can({ role, hasSystemAccess, isCityManager, isOperationsDirector }));

  return (
    <div>
      <h1 className="text-2xl font-bold">METRO UP Control</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Управление обучением и результатами команды · {displayName} ({ROLE_LABEL[role] ?? role})
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 xl:[grid-template-columns:repeat(auto-fit,minmax(300px,1fr))]">
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
