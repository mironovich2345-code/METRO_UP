"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Building2, Check, MapPin, Briefcase, LayoutDashboard, Trophy } from "lucide-react";
import { BottomNavigation } from "@/components/bottom-navigation";
import { AppHeader } from "@/components/app-header";
import { GlassCard } from "@/components/ui/glass-card";
import { Avatar } from "@/components/ui/avatar";
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
  const { profile, isOnboarded, hydrated, telegramUser } = useApp();
  // Role comes ONLY from the server-backed session user — never from localStorage.
  const { user: serverUser } = useAppUser();
  const isAdmin = serverUser?.role === "ADMIN";
  const canSpm = serverUser ? canAccessSpm(serverUser.role) : false; // SPM or ADMIN
  const router = useRouter();

  useEffect(() => {
    if (hydrated && !isOnboarded) router.replace("/welcome");
  }, [hydrated, isOnboarded, router]);

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
          <Avatar
            name={profile.displayName}
            src={telegramUser.photoUrl}
            size={92}
            ring
          />
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
    </div>
  );
}
