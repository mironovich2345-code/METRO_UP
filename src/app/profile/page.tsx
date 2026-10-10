"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Building2, Camera, Check, ChevronRight, HelpCircle, MapPin, Briefcase, LayoutDashboard, Trophy, UserCog } from "lucide-react";
import { BottomNavigation } from "@/components/bottom-navigation";
import { AppHeader } from "@/components/app-header";
import { GlassCard } from "@/components/ui/glass-card";
import { Avatar } from "@/components/ui/avatar";
import { AvatarCropSheet } from "@/components/profile/AvatarCropSheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ThemeSegmented } from "@/components/ui/theme-switcher";
import { SectionHeader } from "@/components/ui/section-header";
import { useApp } from "@/providers/app-provider";
import { useAppUser } from "@/providers/AppUserProvider";
import { getCityById, getClubById, getPositionById } from "@/content";
import { canAccessSpm } from "@/lib/roles";
import { RANKS } from "@/lib/ranks";
import type { AccessStatus, CareerLevel } from "@/lib/profile";
import { cardIn, staggerStack } from "@/lib/motion";
import { cn, formatNumber } from "@/lib/utils";
import { fetchProfileManagementRoles } from "@/lib/api/home-client";
import { useQuery, QUERY_POLICY } from "@/lib/client/query-cache";
import { cacheKeys } from "@/lib/client/cache-keys";
import type { ProfileManagementRoleDTO } from "@/lib/api/home-types";
import { canShowAskQuestionEntry } from "@/lib/client/ask-question-core";
import { loadStoredContext } from "@/lib/home-context-storage";
import { getOwnerKey } from "@/lib/client/owner";

const CAREER_RANK_INDEX: Record<CareerLevel, number> = {
  NEWCOMER: 0,
  MANAGER: 1,
  TOP_MANAGER: 2,
  LEADER: 3,
  MANAGER_PRO: 4,
};

const ACCESS_LABELS: Record<AccessStatus, string> = {
  LIMITED: "Базовый доступ",
  PENDING_APPROVAL: "Ожидает подтверждения",
  FULL: "Полный доступ",
  SUSPENDED: "Доступ приостановлен",
};

export default function ProfileScreen() {
  const { profile, isOnboarded, hydrated } = useApp();
  // Role comes ONLY from the server-backed session user — never from localStorage.
  const { user: serverUser, refresh: refreshAppUser } = useAppUser();
  const [cropOpen, setCropOpen] = useState(false);
  // Sprint: REMEDIATION R3, F-06 — server-derived (hasSystemAccessForUser,
  // the SAME primitive /admin's own layout/routes gate on), not re-derived
  // from the legacy role alone: a grant-only PROJECT_ADMIN (no legacy
  // AppRole=ADMIN) now sees this entry too, matching their real /admin
  // authority exactly. ALWAYS the real actor's own value (never
  // persona-substituted, per meDTO's own doc comment) — View As cannot
  // widen or hide it.
  const isAdmin = serverUser?.hasSystemAccess ?? false;
  const canSpm = serverUser ? canAccessSpm(serverUser.role) : false; // SPM or ADMIN
  const router = useRouter();

  useEffect(() => {
    if (hydrated && !isOnboarded) router.replace("/welcome");
  }, [hydrated, isOnboarded, router]);

  // Sprint: manual-test-round-3, section 4 — "Роль в Metro UP" / "Доступные
  // клубы", server-scoped (never derived from EmployeeProfile.clubId).
  // Empty for a plain MANAGER — no empty block rendered then.
  const { data: managementRolesData } = useQuery(
    hydrated && isOnboarded ? cacheKeys.profileManagementRoles() : null,
    () => fetchProfileManagementRoles().then((r) => r.roles),
    QUERY_POLICY.MEDIUM,
  );
  const managementRoles: ProfileManagementRoleDTO[] = managementRolesData ?? [];

  if (!hydrated || !profile) {
    return <div className="min-h-[100dvh]" />;
  }

  const city = getCityById(profile.cityId);
  const club = getClubById(profile.clubId);
  const position = getPositionById(profile.positionId);
  const levelIndex = CAREER_RANK_INDEX[profile.careerLevel];
  const currentRank = RANKS[levelIndex];

  const info = [
    { icon: MapPin, label: "Город", value: city?.name ?? "—" },
    {
      icon: Building2,
      label: "Клуб",
      value: club ? `MetroFitness ${club.name}` : "—",
    },
    { icon: Briefcase, label: "Должность", value: position?.title ?? "—" },
  ];

  return (
    <div className="relative min-h-[100dvh] pb-32">
      <AppHeader title="Профиль" showThemeSwitcher={false} />

      <motion.main
        variants={staggerStack}
        initial="hidden"
        animate="show"
        className="flex flex-col gap-6 px-5"
      >
        {/* Identity */}
        <motion.div variants={cardIn} className="flex flex-col items-center pt-2">
          {/* METRO UP ROUND 1, Milestone 1 — tap avatar to change photo.
              src is the custom uploaded avatar ONLY (serverUser.avatarUrl) —
              deliberately never telegramUser.photoUrl; no custom avatar
              means initials, by product rule, not a Telegram-photo fallback. */}
          <button
            type="button"
            onClick={() => setCropOpen(true)}
            className="relative rounded-full"
            aria-label="Изменить фото профиля"
          >
            <Avatar
              name={profile.displayName}
              src={serverUser?.avatarUrl ?? undefined}
              size={92}
              ring
            />
            <span className="absolute bottom-0 right-0 flex size-7 items-center justify-center rounded-full border-2 border-background bg-brand">
              <Camera className="size-3.5 text-brand-foreground" />
            </span>
          </button>
          <h1 className="mt-4 text-2xl font-extrabold tracking-tight text-foreground">
            {profile.displayName}
          </h1>
          <div className="mt-2 flex items-center gap-2">
            <Badge variant="brand" size="md">
              {currentRank.title}
            </Badge>
            <Badge variant="neutral" size="md">
              {ACCESS_LABELS[profile.accessStatus]}
            </Badge>
          </div>
        </motion.div>

        {/* Work info */}
        <motion.div variants={cardIn}>
          <GlassCard variant="solid" pad="sm" animateIn={false}>
            {info.map((row, i) => {
              const Icon = row.icon;
              return (
                <div
                  key={row.label}
                  className={cn(
                    "flex items-center gap-3 px-2 py-3",
                    i < info.length - 1 && "border-b border-border",
                  )}
                >
                  <div className="flex size-10 items-center justify-center rounded-xl bg-muted">
                    <Icon className="size-4.5 text-muted-foreground" />
                  </div>
                  <span className="flex-1 text-sm text-muted-foreground">
                    {row.label}
                  </span>
                  <span className="max-w-[55%] truncate text-[15px] font-semibold text-foreground">
                    {row.value}
                  </span>
                </div>
              );
            })}
          </GlassCard>
        </motion.div>

        {/* METRO UP ROUND 1, Milestone 2B/2B.1 — "Задать вопрос" entry point.
            Visible ONLY when the CURRENT EFFECTIVE Mini App context (Home's
            own context-switcher concept, home-context-storage.ts — never a
            legacy UI-only role flag) is one of PERSONAL/CLUB_MANAGER/
            CITY_MANAGER, and accessStatus isn't PENDING_APPROVAL/SUSPENDED
            (canShowAskQuestionEntry, an ALLOWLIST so a future unsupported
            context is hidden automatically). The entry being visible is
            never itself authority — canSendQuestionAs re-validates the
            actual sender context server-side regardless. Deliberately a
            single compact row (not a full descriptive card like Admin/SPM
            below) so it stays non-intrusive per the task's own instruction. */}
        {canShowAskQuestionEntry(loadStoredContext(getOwnerKey())?.type ?? null, profile.accessStatus) && (
          <motion.div variants={cardIn}>
            <GlassCard variant="solid" pad="none" animateIn={false}>
              <button
                type="button"
                onClick={() => router.push("/questions/ask")}
                className="flex w-full items-center gap-3 p-4 text-left"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand/12">
                  <HelpCircle className="size-4.5 text-brand" />
                </span>
                <span className="flex-1 text-[15px] font-semibold text-foreground">Задать вопрос</span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </button>
            </GlassCard>
          </motion.div>
        )}

        {/* Sprint: manual-test-round-3, section 4 — "Роль в Metro UP" /
            "Доступные клубы". One card per management role the real actor
            holds (today only ever CITY_MANAGER populates this); a plain
            MANAGER gets managementRoles:[] and no card renders at all. */}
        {managementRoles.map((role) => (
          <motion.div key={role.type} variants={cardIn} className="flex flex-col gap-3">
            <SectionHeader title="Роль в Metro UP" />
            <GlassCard variant="solid" pad="md" animateIn={false}>
              <div className="flex items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand/12">
                  <UserCog className="size-4.5 text-brand" />
                </span>
                <span className="text-[15px] font-semibold text-foreground">{role.label}</span>
              </div>
              {role.clubs.length > 0 && (
                <div className="mt-3 border-t border-border pt-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Доступные клубы</p>
                  <ul className="flex flex-col gap-1.5">
                    {role.clubs.map((c) => (
                      <li key={c.id} className="flex items-center gap-2 text-sm text-foreground">
                        <span className="size-1.5 shrink-0 rounded-full bg-brand" />
                        <span className="truncate">{c.name}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </GlassCard>
          </motion.div>
        ))}

        {/* Admin CMS entry — ONLY for server role ADMIN (never EMPLOYEE/SPM/CLUB_MANAGER). */}
        {isAdmin && (
          <motion.div variants={cardIn}>
            <GlassCard variant="solid" pad="md" animateIn={false}>
              <div className="flex items-center gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-brand/12">
                  <LayoutDashboard className="size-5 text-brand" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-foreground">Панель управления</p>
                  <p className="text-sm text-muted-foreground">
                    Управление обучением и материалами
                  </p>
                </div>
              </div>
              <Button
                block
                variant="secondary"
                className="mt-3"
                onClick={() => router.push("/admin")}
              >
                Открыть
              </Button>
            </GlassCard>
          </motion.div>
        )}

        {/* SPM panel entry — for server role SPM or ADMIN (never EMPLOYEE/CLUB_MANAGER). */}
        {canSpm && (
          <motion.div variants={cardIn}>
            <GlassCard variant="solid" pad="md" animateIn={false}>
              <div className="flex items-center gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-brand/12">
                  <Trophy className="size-5 text-brand" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-foreground">Панель СПМ</p>
                  <p className="text-sm text-muted-foreground">
                    Продажи, тайный покупатель и рейтинг
                  </p>
                </div>
              </div>
              <Button
                block
                variant="secondary"
                className="mt-3"
                onClick={() => router.push("/spm")}
              >
                Открыть
              </Button>
            </GlassCard>
          </motion.div>
        )}

        {/* Career ladder */}
        <motion.div variants={cardIn} className="flex flex-col gap-3">
          <SectionHeader title="Карьерная лестница" />
          <GlassCard variant="solid" pad="md" animateIn={false}>
            <ol className="flex flex-col">
              {RANKS.map((rank, i) => {
                const reached = i <= levelIndex;
                const current = i === levelIndex;
                return (
                  <li key={rank.id} className="flex items-center gap-3.5">
                    <div className="flex flex-col items-center self-stretch">
                      <span
                        className={cn(
                          "flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors",
                          current
                            ? "bg-brand text-brand-foreground"
                            : reached
                              ? "bg-foreground text-background"
                              : "bg-muted text-muted-foreground",
                        )}
                      >
                        {reached ? (
                          <Check className="size-4" strokeWidth={3} />
                        ) : (
                          i + 1
                        )}
                      </span>
                      {i < RANKS.length - 1 && (
                        <span
                          className={cn(
                            "my-1 w-0.5 flex-1 rounded-full",
                            reached ? "bg-foreground/30" : "bg-border",
                          )}
                        />
                      )}
                    </div>
                    <div
                      className={cn(
                        "flex-1 pb-4",
                        i === RANKS.length - 1 && "pb-0",
                      )}
                    >
                      <p
                        className={cn(
                          "text-[15px] font-bold",
                          reached ? "text-foreground" : "text-muted-foreground",
                        )}
                      >
                        {rank.title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatNumber(rank.minXp)} XP · {rank.tagline}
                      </p>
                    </div>
                    {current && (
                      <Badge variant="brand" size="sm">
                        Сейчас
                      </Badge>
                    )}
                  </li>
                );
              })}
            </ol>
          </GlassCard>
        </motion.div>

        {/* Appearance */}
        <motion.div variants={cardIn} className="flex flex-col gap-3">
          <SectionHeader title="Тема оформления" />
          <ThemeSegmented />
        </motion.div>
      </motion.main>

      <BottomNavigation />

      <AvatarCropSheet
        open={cropOpen}
        onClose={() => setCropOpen(false)}
        onSaved={() => {
          // Pull the fresh AppUserDTO (now carrying the new avatarUrl) —
          // same refresh() AppShellFrame's ViewAsBanner already calls after
          // its own session-affecting action, not a new mechanism.
          void refreshAppUser();
        }}
      />
    </div>
  );
}
