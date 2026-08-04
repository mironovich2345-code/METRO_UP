"use client";

import { motion } from "framer-motion";
import { Building2, Check, MapPin, Briefcase } from "lucide-react";
import { BottomNavigation } from "@/components/bottom-navigation";
import { AppHeader } from "@/components/app-header";
import { GlassCard } from "@/components/ui/glass-card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ThemeSegmented } from "@/components/ui/theme-switcher";
import { SectionHeader } from "@/components/ui/section-header";
import { useApp } from "@/providers/app-provider";
import { CITIES, CLUBS, POSITIONS } from "@/lib/data";
import { RANKS, getRankProgress } from "@/lib/ranks";
import { cardIn, staggerStack } from "@/lib/motion";
import { cn, formatNumber } from "@/lib/utils";

export default function ProfileScreen() {
  const { profile, telegramUser } = useApp();

  const city = CITIES.find((c) => c.id === profile.cityId);
  const club = CLUBS.find((c) => c.id === profile.clubId);
  const position = POSITIONS.find((p) => p.id === profile.positionId);
  const rankProgress = getRankProgress(profile.xp);

  const info = [
    { icon: MapPin, label: "Город", value: city?.name ?? "—" },
    { icon: Building2, label: "Клуб", value: club?.name ?? "—" },
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
            src={telegramUser?.photoUrl}
            size={92}
            ring
          />
          <h1 className="mt-4 text-2xl font-extrabold tracking-tight text-foreground">
            {profile.displayName}
          </h1>
          <div className="mt-2 flex items-center gap-2">
            <Badge variant="brand" size="md">
              {rankProgress.current.title}
            </Badge>
            <Badge variant="neutral" size="md">
              {formatNumber(profile.xp)} XP
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
                  <span className="text-[15px] font-semibold text-foreground">
                    {row.value}
                  </span>
                </div>
              );
            })}
          </GlassCard>
        </motion.div>

        {/* Career ladder */}
        <motion.div variants={cardIn} className="flex flex-col gap-3">
          <SectionHeader title="Карьерная лестница" />
          <GlassCard variant="solid" pad="md" animateIn={false}>
            <ol className="flex flex-col">
              {RANKS.map((rank, i) => {
                const reached = i <= rankProgress.levelIndex;
                const current = i === rankProgress.levelIndex;
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
                    <div className={cn("flex-1 pb-4", i === RANKS.length - 1 && "pb-0")}>
                      <p
                        className={cn(
                          "text-[15px] font-bold",
                          current ? "text-foreground" : reached ? "text-foreground" : "text-muted-foreground",
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
