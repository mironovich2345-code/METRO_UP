"use client";

import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Building2, ChevronRight, GraduationCap } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { RevalidatingBar } from "@/components/ui/revalidating-bar";
import { ApiError } from "@/lib/api/client";
import { cabinetApi } from "@/lib/api/cabinet-client";
import type { CityManagerTrainingClubRowDTO } from "@/lib/api/cabinet-client";
import { useQuery, QUERY_POLICY } from "@/lib/client/query-cache";
import { cacheKeys } from "@/lib/client/cache-keys";
import { cardIn, staggerStack } from "@/lib/motion";
import { pluralRu } from "@/lib/cabinet-ui";

/**
 * Sprint: manual-test-round-3, section 5A — CITY_MANAGER's club-level
 * training drill-down: "Обучение по клубам" (Home / /city) → this list of
 * effective-scope clubs → tap a club → /team?clubId=X (the SAME, already
 * scoped roster screen fixed in section 1 — 5B needs no separate screen,
 * see that route's own doc comment) → tap an employee → /team/employee (5C,
 * shared with CLUB_MANAGER per 5D). Honest Academy semantics only: no
 * mandatory/overdue concept exists in the data, so none is shown here.
 */
export default function CityTrainingPage() {
  const router = useRouter();
  const { data, error, isLoading, isValidating, mutate } = useQuery(
    cacheKeys.cityTraining(),
    () => cabinetApi.cityManagerTraining().then((r) => r.clubs),
    QUERY_POLICY.MEDIUM, // training aggregates — changes from the employee's own actions, not another actor's
  );
  const clubs: CityManagerTrainingClubRowDTO[] | null = data ?? null;
  const status: "loading" | "ready" | "error" | "denied" =
    error instanceof ApiError && (error.status === 403 || error.status === 401)
      ? "denied"
      : error
        ? "error"
        : !data && isLoading
          ? "loading"
          : data
            ? "ready"
            : "loading";

  return (
    <div className="relative min-h-[100dvh] pb-24">
      <AppHeader title="Обучение по клубам" showBack backHref="/city" showThemeSwitcher={false} />
      <RevalidatingBar show={Boolean(data) && isValidating} />

      <motion.main variants={staggerStack} initial="hidden" animate="show" className="flex flex-col gap-5 px-5 pt-2">
        {status === "loading" && (
          <div className="flex flex-col gap-3">
            <div className="h-24 animate-pulse rounded-3xl bg-muted" />
            <div className="h-24 animate-pulse rounded-3xl bg-muted" />
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

        {status === "ready" && clubs && (
          <>
            {clubs.length === 0 ? (
              <GlassCard variant="solid" pad="lg" animateIn={false} className="text-center">
                <p className="text-sm text-muted-foreground">В вашей зоне пока нет клубов.</p>
              </GlassCard>
            ) : (
              <motion.div variants={cardIn} className="flex flex-col gap-3">
                <GlassCard variant="solid" pad="none" animateIn={false} className="divide-y divide-border">
                  {clubs.map((c) => (
                    <button
                      key={c.clubId}
                      type="button"
                      onClick={() => router.push(`/team?clubId=${c.clubId}`)}
                      className="flex w-full items-center gap-3 p-4 text-left transition-colors active:bg-foreground/5"
                    >
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-brand/12">
                        <Building2 className="size-4.5 text-brand" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{c.clubName}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {pluralRu(c.employeeCount, "сотрудник", "сотрудника", "сотрудников")}
                          {c.averageProgressPercent != null && ` · Средний прогресс ${c.averageProgressPercent}%`}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          Завершили всё: {c.employeesCompletedAll} · Проходят обучение: {c.employeesInTraining}
                        </p>
                      </div>
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                    </button>
                  ))}
                </GlassCard>
              </motion.div>
            )}

            <motion.div variants={cardIn}>
              <GlassCard variant="solid" pad="md" animateIn={false} className="flex items-center gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-2xl bg-muted">
                  <GraduationCap className="size-4.5 text-muted-foreground" />
                </span>
                <p className="text-xs text-muted-foreground">
                  Данные — из Академии: опубликованные уроки и результаты тестов по каждому клубу вашей зоны.
                </p>
              </GlassCard>
            </motion.div>
          </>
        )}
      </motion.main>
    </div>
  );
}
