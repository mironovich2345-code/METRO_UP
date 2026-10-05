"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { CheckCircle2, Clock, GraduationCap, Lock } from "lucide-react";
import { BottomNavigation, useEffectiveNavContext } from "@/components/bottom-navigation";
import { AppHeader } from "@/components/app-header";
import { ManagementAvatarLink } from "@/components/management/management-primitives";
import { GlassCard } from "@/components/ui/glass-card";
import { Badge } from "@/components/ui/badge";
import { XPProgress } from "@/components/ui/xp-progress";
import { SectionHeader } from "@/components/ui/section-header";
import { Button } from "@/components/ui/button";
import { RevalidatingBar } from "@/components/ui/revalidating-bar";
import { useApp } from "@/providers/app-provider";
import { cardIn, staggerStack } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/telegram";
import { homeContextToAcademySection } from "@/lib/cabinet-ui";
import { isManagementNavContext } from "@/lib/nav-items";
import { loadStoredContext } from "@/lib/home-context-storage";
import { fetchAcademyOverview } from "@/lib/api/content-client";
import { useQuery, QUERY_POLICY } from "@/lib/client/query-cache";
import { cacheKeys } from "@/lib/client/cache-keys";
import type { AcademyDayCardDTO, AcademyOverviewDTO, AcademySectionsDTO, AcademyTargetRoleDTO } from "@/lib/api/content-types";

const SECTION_LABEL: Record<AcademyTargetRoleDTO, string> = {
  MANAGER: "Менеджер",
  CLUB_MANAGER: "Управляющий",
  CITY_MANAGER: "Ст. города",
};

/**
 * Academy — DB/CMS is the source of truth. Programs, days, lessons and progress
 * all come from PostgreSQL (PUBLISHED lessons only). No static mock lesson data.
 *
 * Sprint: manual-test-round-2, section 4 — role-based Academy sections. The
 * server (GET /api/academy/overview?section=) is what actually decides both
 * WHICH sections exist (allowedSections, from the real actor's current
 * RoleAssignment grants) and which one a request's content belongs to
 * (activeSection) — this page only renders whatever it's told and asks for a
 * different one on tap; it can never fabricate access to a section the
 * server won't also independently confirm.
 */
export default function AcademyScreen() {
  const { telegramUser } = useApp();
  // Round A.1, section A — /academy is a root screen for EVERY context
  // (PERSONAL's own existing nav tab, and now also CLUB_MANAGER's/
  // CITY_MANAGER's). The avatar entry is additive, shown only for the two
  // management contexts — PERSONAL's header stays byte-identical.
  const isManagementRoot = isManagementNavContext(useEffectiveNavContext());
  // Sprint: mini-app-performance — `undefined` = not yet resolved from
  // storage (key stays null, nothing fetched yet); `"default"` = resolved,
  // no stored preference, ask the server for its own MANAGER-first fallback;
  // otherwise the persisted section itself. Kept as a cache-key-shaped
  // string (never AcademyTargetRoleDTO | undefined directly) so "default"
  // and a real section can never collide with each other in the SWR cache.
  const [sectionKey, setSectionKey] = useState<string | undefined>(undefined);

  useEffect(() => {
    // Section 4 — "default selected Academy section should follow the active
    // Mini App context when possible": reads the SAME persisted context Home
    // uses (home-context-storage.ts) rather than a separate Academy-only
    // preference — no context concept, no default hint, plain fetch (the
    // server's own MANAGER-first fallback applies).
    const ownerKey = telegramUser?.id != null ? String(telegramUser.id) : "demo";
    const stored = loadStoredContext(ownerKey);
    setSectionKey(stored ? homeContextToAcademySection(stored.type) : "default");
  }, [telegramUser?.id]);

  const requestedSection = sectionKey && sectionKey !== "default" ? (sectionKey as AcademyTargetRoleDTO) : undefined;
  const { data, error, isLoading, isValidating, mutate } = useQuery<AcademyOverviewDTO & Partial<AcademySectionsDTO>>(
    sectionKey ? cacheKeys.academyOverview(sectionKey) : null,
    () => fetchAcademyOverview(requestedSection),
    QUERY_POLICY.MEDIUM,
  );
  const status: "loading" | "ready" | "error" = error ? "error" : !data && isLoading ? "loading" : data ? "ready" : "loading";

  const switchSection = (section: AcademyTargetRoleDTO) => {
    haptic("light");
    setSectionKey(section);
  };

  return (
    <div className="relative min-h-[100dvh] pb-32">
      <AppHeader title="Академия" subtitle="Твои курсы и прогресс" leading={isManagementRoot ? <ManagementAvatarLink /> : undefined} />
      <RevalidatingBar show={Boolean(data) && isValidating} />

      {status === "ready" && data?.allowedSections && data.allowedSections.length > 1 && (
        <div className="flex gap-2 overflow-x-auto px-5 pb-1">
          {data.allowedSections.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => switchSection(s)}
              className={cn(
                "shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition-colors",
                s === data.activeSection ? "bg-brand text-brand-foreground" : "bg-muted text-muted-foreground active:bg-border",
              )}
            >
              {SECTION_LABEL[s]}
            </button>
          ))}
        </div>
      )}

      <motion.main variants={staggerStack} initial="hidden" animate="show" className="px-5">
        {status === "loading" && (
          <div className="space-y-4">
            <div className="h-28 w-full animate-pulse rounded-3xl bg-muted" />
            <div className="grid grid-cols-2 gap-3">
              <div className="h-36 animate-pulse rounded-3xl bg-muted" />
              <div className="h-36 animate-pulse rounded-3xl bg-muted" />
            </div>
          </div>
        )}

        {status === "error" && (
          <div className="mt-16 text-center">
            <p className="font-semibold">Не удалось загрузить</p>
            <Button className="mt-4" variant="secondary" onClick={() => mutate()}>
              Повторить
            </Button>
          </div>
        )}

        {status === "ready" && data && !data.hasContent && (
          <motion.div variants={cardIn} className="mt-10">
            <GlassCard variant="solid" pad="lg" animateIn={false} className="text-center">
              <span className="mx-auto mb-3 flex size-12 items-center justify-center rounded-2xl bg-brand/12">
                <GraduationCap className="size-6 text-brand" />
              </span>
              <p className="font-semibold">Здесь скоро появятся уроки</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Обучение готовится. Загляни чуть позже.
              </p>
            </GlassCard>
          </motion.div>
        )}

        {status === "ready" && data && data.hasContent && (
          <>
            {/* Overall progress — by PUBLISHED required lessons */}
            <motion.div variants={cardIn}>
              <GlassCard variant="solid" pad="lg" animateIn={false}>
                <div className="flex items-center gap-4">
                  <div className="flex size-14 items-center justify-center rounded-2xl bg-brand/12">
                    <GraduationCap className="size-7 text-foreground" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-muted-foreground">Общий прогресс</p>
                    <p className="text-2xl font-extrabold tracking-tight text-foreground">
                      {Math.round(data.overall.ratio * 100)}%
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-extrabold text-foreground">{data.overall.completed}</p>
                    <p className="text-xs font-medium text-muted-foreground">
                      из {data.overall.total} уроков
                    </p>
                  </div>
                </div>
                <div className="mt-4">
                  <XPProgress value={data.overall.ratio} size="md" />
                </div>
              </GlassCard>
            </motion.div>

            {data.programs.map((program) => (
              <div key={program.id}>
                <motion.div variants={cardIn} className="mt-6">
                  <SectionHeader title={program.title} />
                </motion.div>
                {program.days.length === 0 ? (
                  <motion.p variants={cardIn} className="mt-2 text-sm text-muted-foreground">
                    Дни ещё не заданы
                  </motion.p>
                ) : (
                  <motion.div
                    variants={staggerStack}
                    initial="hidden"
                    animate="show"
                    className="mt-3 grid grid-cols-2 gap-3"
                  >
                    {program.days.map((day) => (
                      <motion.div key={day.id} variants={cardIn}>
                        <DayCardDb day={day} />
                      </motion.div>
                    ))}
                  </motion.div>
                )}
              </div>
            ))}
          </>
        )}
      </motion.main>

      <BottomNavigation />
    </div>
  );
}

function DayCardDb({ day }: { day: AcademyDayCardDTO }) {
  const router = useRouter();
  const empty = day.totalLessons === 0;
  const done = day.totalLessons > 0 && day.completedLessons === day.totalLessons;
  const disabled = day.locked || empty;

  const open = () => {
    if (disabled) return;
    haptic("medium");
    router.push(`/academy/${day.id}`);
  };

  return (
    <GlassCard
      variant="solid"
      pad="md"
      animateIn={false}
      interactive={!disabled}
      onClick={open}
      className={cn("flex h-full flex-col", disabled && "opacity-60")}
    >
      <div className="flex items-center justify-between">
        <span
          className={cn(
            "flex size-10 items-center justify-center rounded-2xl text-sm font-bold",
            done ? "bg-success text-white" : day.locked ? "bg-muted text-muted-foreground" : "bg-brand/12 text-brand",
          )}
        >
          {done ? <CheckCircle2 className="size-5" /> : day.locked ? <Lock className="size-4" /> : day.virtual ? <GraduationCap className="size-5" /> : day.dayNumber}
        </span>
        {!empty && (
          <Badge variant="neutral" size="sm">
            {day.completedLessons}/{day.totalLessons}
          </Badge>
        )}
      </div>

      <p className="mt-3 line-clamp-2 font-bold leading-tight">{day.title}</p>

      {empty ? (
        <p className="mt-1 text-xs text-muted-foreground">Скоро появятся уроки</p>
      ) : (
        <>
          <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="size-3" /> ~{day.durationMinutes} мин
          </div>
          <div className="mt-auto pt-3">
            <XPProgress value={day.progressPercent / 100} size="sm" />
          </div>
        </>
      )}
    </GlassCard>
  );
}
