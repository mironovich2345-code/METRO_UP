"use client";

import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { AlertCircle, Building2, CheckCircle2, ChevronRight, Clock, GraduationCap } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { RevalidatingBar } from "@/components/ui/revalidating-bar";
import { ApiError } from "@/lib/api/client";
import { cabinetApi } from "@/lib/api/cabinet-client";
import type { CityManagerDashboardDTO } from "@/lib/api/cabinet-client";
import { useQuery, QUERY_POLICY } from "@/lib/client/query-cache";
import { cacheKeys } from "@/lib/client/cache-keys";
import { attentionCardCount, clubsWithoutManager, distinctCityNames, groupPendingApprovalByClub, pluralRu } from "@/lib/cabinet-ui";
import { cardIn, staggerStack } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * Sprint: mini-app-role-experience, section 12 — CITY_MANAGER's "Мои клубы"
 * Mini App screen. Same read model as the desktop /control/city cabinet
 * (CityManagerCabinet.tsx, step 5) — cabinetApi.cityManager() — reused
 * as-is; this is a mobile-first re-presentation, not a new backend.
 */
export default function CityClubsPage() {
  const router = useRouter();
  const { data: dashboard, error, isLoading, isValidating, mutate } = useQuery<CityManagerDashboardDTO>(
    cacheKeys.cityDashboard(),
    cabinetApi.cityManager,
    QUERY_POLICY.MUTABLE, // attention/pending-approval counts change from other actors' actions
  );
  const status: "loading" | "ready" | "error" | "denied" =
    error instanceof ApiError && (error.status === 403 || error.status === 401)
      ? "denied"
      : error
        ? "error"
        : !dashboard && isLoading
          ? "loading"
          : dashboard
            ? "ready"
            : "loading";

  const cityNames = dashboard ? distinctCityNames(dashboard.clubs) : [];
  const scopeLabel =
    cityNames.length === 0 ? "Отдельные клубы" : cityNames.length === 1 ? cityNames[0] : `Города: ${cityNames.join(", ")}`;

  return (
    <div className="relative min-h-[100dvh] pb-24">
      <AppHeader title="Мои клубы" subtitle={dashboard ? scopeLabel : undefined} showBack backHref="/home" showThemeSwitcher={false} />
      <RevalidatingBar show={Boolean(dashboard) && isValidating} />

      <motion.main variants={staggerStack} initial="hidden" animate="show" className="flex flex-col gap-5 px-5 pt-2">
        {status === "loading" && (
          <div className="flex flex-col gap-3">
            <div className="h-24 animate-pulse rounded-3xl bg-muted" />
            <div className="h-40 animate-pulse rounded-3xl bg-muted" />
          </div>
        )}
        {status === "denied" && (
          <GlassCard variant="solid" pad="lg" animateIn={false} className="text-center">
            <p className="font-semibold">Раздел доступен только Ст. города</p>
          </GlassCard>
        )}
        {status === "error" && (
          <GlassCard variant="solid" pad="lg" animateIn={false} className="text-center">
            <p className="font-semibold">Не удалось загрузить</p>
            <Button className="mt-4" variant="secondary" onClick={() => mutate()}>Повторить</Button>
          </GlassCard>
        )}

        {status === "ready" && dashboard && (
          <>
            <motion.div variants={cardIn} className="grid grid-cols-3 gap-3">
              <GlassCard variant="solid" pad="md" animateIn={false}>
                <p className="text-xs text-muted-foreground">Клубов</p>
                <p className="mt-1 text-xl font-extrabold tabular-nums">{dashboard.summary.clubCount}</p>
              </GlassCard>
              <GlassCard variant="solid" pad="md" animateIn={false}>
                <p className="text-xs text-muted-foreground">Сотрудников</p>
                <p className="mt-1 text-xl font-extrabold tabular-nums">{dashboard.summary.employeeCount}</p>
              </GlassCard>
              <GlassCard variant="solid" pad="md" animateIn={false}>
                <p className="text-xs text-muted-foreground">Управляющих</p>
                <p className="mt-1 text-xl font-extrabold tabular-nums">{dashboard.summary.clubManagerCount}</p>
              </GlassCard>
            </motion.div>

            <motion.div variants={cardIn} className="flex flex-col gap-3">
              <p className="px-1 text-sm font-bold text-foreground">Требует внимания</p>
              <AttentionList attention={dashboard.attention} onOpenClub={(clubId) => router.push(`/city/club?clubId=${clubId}`)} />
            </motion.div>

            <motion.div variants={cardIn} className="flex flex-col gap-3">
              <p className="px-1 text-sm font-bold text-foreground">Клубы</p>
              {dashboard.clubs.length === 0 ? (
                <GlassCard variant="solid" pad="md" animateIn={false}>
                  <p className="text-sm text-muted-foreground">В вашей зоне пока нет клубов.</p>
                </GlassCard>
              ) : (
                <GlassCard variant="solid" pad="none" animateIn={false} className="divide-y divide-border">
                  {dashboard.clubs.map((c) => (
                    <button
                      key={c.clubId}
                      type="button"
                      onClick={() => router.push(`/city/club?clubId=${c.clubId}`)}
                      className="flex w-full items-center gap-3 p-4 text-left transition-colors active:bg-foreground/5"
                    >
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-brand/12">
                        <Building2 className="size-4.5 text-brand" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{c.clubName}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {c.activeClubManager?.displayName ?? "Не назначен"} · {pluralRu(c.employeeCount, "сотрудник", "сотрудника", "сотрудников")}
                          {c.trainingCompletionPercent != null && ` · Обучение ${c.trainingCompletionPercent}%`}
                        </p>
                      </div>
                      {c.attentionCount > 0 && (
                        <span className="shrink-0 rounded-full bg-brand/12 px-2 py-0.5 text-xs font-bold text-brand">{c.attentionCount}</span>
                      )}
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground/50" />
                    </button>
                  ))}
                </GlassCard>
              )}
            </motion.div>

            <motion.div variants={cardIn}>
              {/* Sprint: manual-test-round-3, section 5A — tap-through to the
                  per-club training drill-down (/city/training), scoped
                  server-side to this same CITY_MANAGER's effective clubs. */}
              <GlassCard variant="solid" pad="lg" animateIn={false} interactive onClick={() => router.push("/city/training")}>
                <div className="flex items-center gap-2">
                  <span className="flex size-9 items-center justify-center rounded-2xl bg-brand/12">
                    <GraduationCap className="size-5 text-brand" />
                  </span>
                  <p className="flex-1 font-bold">Обучение по клубам</p>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </div>
                {dashboard.training ? (
                  <div className="mt-2 flex flex-col gap-1 text-sm text-muted-foreground">
                    <p>
                      Средний прогресс:{" "}
                      {dashboard.training.averageProgressPercent != null ? `${dashboard.training.averageProgressPercent}%` : "Нет данных"}
                    </p>
                    <p>Завершили все опубликованные уроки: {dashboard.training.employeesCompletedAll}</p>
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">Нет данных</p>
                )}
              </GlassCard>
            </motion.div>
          </>
        )}
      </motion.main>
    </div>
  );
}

function AttentionList({
  attention,
  onOpenClub,
}: {
  attention: CityManagerDashboardDTO["attention"];
  onOpenClub: (clubId: string) => void;
}) {
  const withoutManager = clubsWithoutManager(attention);
  const pendingGroups = groupPendingApprovalByClub(attention);
  const total = attentionCardCount(attention);

  if (total === 0) {
    return (
      <GlassCard variant="solid" pad="md" animateIn={false} className="flex items-center gap-3">
        <CheckCircle2 className="size-5 shrink-0 text-success" />
        <p className="text-sm text-muted-foreground">Сейчас ничего не требует внимания.</p>
      </GlassCard>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {withoutManager.map((item) => (
        <GlassCard
          key={`club-${item.entityId}`}
          variant="solid"
          pad="md"
          animateIn={false}
          interactive
          onClick={() => onOpenClub(item.entityId)}
          className="flex items-center gap-3"
        >
          <AlertCircle className="size-5 shrink-0 text-red-500" />
          <p className="min-w-0 flex-1 truncate text-sm font-semibold">В клубе {item.entityName} не назначен управляющий</p>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
        </GlassCard>
      ))}
      {pendingGroups.map((entry) => (
        <GlassCard
          key={`pending-${entry.clubId}`}
          variant="solid"
          pad="md"
          animateIn={false}
          interactive
          onClick={() => onOpenClub(entry.clubId)}
          className={cn("flex items-center gap-3")}
        >
          <Clock className="size-5 shrink-0 text-brand" />
          <p className="min-w-0 flex-1 truncate text-sm font-semibold">
            {entry.count} {pluralRu(entry.count, "сотрудник", "сотрудника", "сотрудников")} {pluralRu(entry.count, "ожидает", "ожидают", "ожидают")} подтверждения
          </p>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
        </GlassCard>
      ))}
    </div>
  );
}
