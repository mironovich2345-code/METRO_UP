"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  Building2,
  Check,
  ChevronLeft,
  MapPin,
  Search,
  X,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { ProgressDots } from "@/components/onboarding/progress-dots";
import { useApp } from "@/providers/app-provider";
import { useTelegramBackButton } from "@/providers/TelegramProvider";
import {
  getCities,
  getCityById,
  getClubById,
  getClubsByCityId,
  getPositionById,
  getPositions,
} from "@/content";
import { resolveIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { easeOutSoft, springSoft } from "@/lib/motion";
import { haptic, hapticSelection, hapticSuccess } from "@/lib/telegram";

const PROGRESS_STEPS = [
  "Профиль",
  "Город",
  "Клуб",
  "Должность",
  "Подтверждение",
];

type Step = 0 | 1 | 2 | 3;

/** Generic tappable selection card with active state + check. */
function SelectCard({
  active,
  onClick,
  index,
  icon,
  title,
  subtitle,
  meta,
}: {
  active: boolean;
  onClick: () => void;
  index: number;
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  meta?: string;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.04, 0.3), ...springSoft }}
      whileTap={{ scale: 0.98 }}
      className={cn(
        "flex w-full items-center gap-4 rounded-3xl border-2 p-4 text-left transition-colors",
        active
          ? "border-brand bg-brand/8"
          : "border-border bg-card hover:border-border-strong",
      )}
    >
      <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-brand/12 text-foreground">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-bold text-foreground">
          {title}
        </p>
        {subtitle && (
          <p className="truncate text-xs font-medium text-muted-foreground">
            {subtitle}
          </p>
        )}
        {meta && (
          <p className="truncate text-[11px] font-medium text-brand">{meta}</p>
        )}
      </div>
      <span
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
          active
            ? "border-brand bg-brand text-brand-foreground"
            : "border-border-strong",
        )}
      >
        {active && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={springSoft}
          >
            <Check className="size-4" strokeWidth={3} />
          </motion.span>
        )}
      </span>
    </motion.button>
  );
}

export default function SetupScreen() {
  const router = useRouter();
  const {
    draft,
    telegramUser,
    selectCity,
    selectClub,
    selectPosition,
    completeOnboarding,
  } = useApp();

  const [step, setStep] = useState<Step>(0);
  const [dir, setDir] = useState(1);
  const [query, setQuery] = useState("");

  const goTo = (next: Step, direction: number) => {
    setDir(direction);
    setStep(next);
  };

  const back = () => {
    if (step === 0) {
      router.push("/welcome");
      return;
    }
    haptic("light");
    goTo((step - 1) as Step, -1);
  };

  // Native Telegram BackButton mirrors the in-app back navigation.
  useTelegramBackButton(true, back);

  const cities = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = getCities();
    if (!q) return all;
    return all.filter((c) => c.name.toLowerCase().includes(q));
  }, [query]);

  const clubs = useMemo(
    () => getClubsByCityId(draft.cityId),
    [draft.cityId],
  );
  const positions = getPositions();

  const chooseCity = (cityId: string) => {
    hapticSelection();
    selectCity(cityId);
    setQuery("");
    setTimeout(() => goTo(1, 1), 160);
  };
  const chooseClub = (clubId: string) => {
    hapticSelection();
    selectClub(clubId);
    setTimeout(() => goTo(2, 1), 160);
  };
  const choosePosition = (positionId: (typeof positions)[number]["id"]) => {
    hapticSelection();
    selectPosition(positionId);
    setTimeout(() => goTo(3, 1), 160);
  };

  const finish = () => {
    hapticSuccess();
    const profile = completeOnboarding();
    if (profile) router.replace("/home?welcome=1");
  };

  const confirmCity = getCityById(draft.cityId);
  const confirmClub = getClubById(draft.clubId);
  const confirmPosition = getPositionById(draft.positionId);

  return (
    <main className="brand-aura flex min-h-[100dvh] flex-col px-6 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-[calc(env(safe-area-inset-top)+14px)]">
      {/* Header + progress */}
      <div className="flex items-center gap-3">
        <motion.button
          type="button"
          whileTap={{ scale: 0.9 }}
          onClick={back}
          className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-border bg-card"
          aria-label="Назад"
        >
          <ChevronLeft className="size-5" />
        </motion.button>
        <div className="flex-1">
          <ProgressDots steps={PROGRESS_STEPS} current={step + 1} />
        </div>
      </div>

      <div className="relative mt-7 flex-1">
        <AnimatePresence mode="wait" custom={dir}>
          <motion.div
            key={step}
            custom={dir}
            initial={{ opacity: 0, x: dir * 36 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: dir * -36 }}
            transition={{ duration: 0.3, ease: easeOutSoft }}
            className="flex flex-col"
          >
            {/* Step 0 — City */}
            {step === 0 && (
              <>
                <h1 className="text-[26px] font-extrabold tracking-tight text-foreground">
                  В каком городе ты работаешь?
                </h1>
                <p className="mt-1.5 text-[15px] text-muted-foreground">
                  Выбери свой город MetroFitness
                </p>

                <div className="relative mt-5">
                  <Search className="pointer-events-none absolute left-4 top-1/2 size-4.5 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Найти город"
                    className="w-full rounded-2xl border-2 border-border bg-card py-3.5 pl-11 pr-11 text-[15px] font-medium text-foreground outline-none transition-colors focus:border-brand"
                  />
                  {query && (
                    <button
                      type="button"
                      onClick={() => setQuery("")}
                      className="absolute right-3 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full bg-muted text-muted-foreground"
                      aria-label="Очистить"
                    >
                      <X className="size-4" />
                    </button>
                  )}
                </div>

                <div className="mt-4 flex flex-col gap-2.5 pb-6">
                  {cities.length === 0 ? (
                    <div className="flex flex-col items-center gap-1 rounded-3xl border border-border bg-card px-4 py-10 text-center">
                      <p className="text-[15px] font-bold text-foreground">
                        Ничего не найдено
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Попробуй изменить запрос
                      </p>
                    </div>
                  ) : (
                    cities.map((city, i) => (
                      <SelectCard
                        key={city.id}
                        index={i}
                        active={draft.cityId === city.id}
                        onClick={() => chooseCity(city.id)}
                        icon={<MapPin className="size-5" />}
                        title={city.name}
                        subtitle={`${city.clubs.length} ${
                          city.clubs.length === 1 ? "клуб" : "клуба"
                        }`}
                      />
                    ))
                  )}
                </div>
              </>
            )}

            {/* Step 1 — Club */}
            {step === 1 && (
              <>
                <h1 className="text-[26px] font-extrabold tracking-tight text-foreground">
                  Выбери свой клуб
                </h1>
                <p className="mt-1.5 text-[15px] text-muted-foreground">
                  {confirmCity?.name}
                </p>
                <div className="mt-6 flex flex-col gap-2.5 pb-6">
                  {clubs.map((club, i) => (
                    <SelectCard
                      key={club.id}
                      index={i}
                      active={draft.clubId === club.id}
                      onClick={() => chooseClub(club.id)}
                      icon={<Building2 className="size-5" />}
                      title={club.name}
                      subtitle={club.address}
                      meta={club.landmark}
                    />
                  ))}
                </div>
              </>
            )}

            {/* Step 2 — Position */}
            {step === 2 && (
              <>
                <h1 className="text-[26px] font-extrabold tracking-tight text-foreground">
                  Какая у тебя должность?
                </h1>
                <p className="mt-1.5 text-[15px] text-muted-foreground">
                  Так мы подберём обучение
                </p>
                <div className="mt-6 flex flex-col gap-2.5 pb-6">
                  {positions.map((position, i) => {
                    const Icon = resolveIcon(position.icon);
                    return (
                      <SelectCard
                        key={position.id}
                        index={i}
                        active={draft.positionId === position.id}
                        onClick={() => choosePosition(position.id)}
                        icon={<Icon className="size-5" />}
                        title={position.title}
                        subtitle={position.description}
                      />
                    );
                  })}
                </div>
              </>
            )}

            {/* Step 3 — Confirmation */}
            {step === 3 && (
              <div className="flex flex-col pb-6">
                <h1 className="text-[26px] font-extrabold tracking-tight text-foreground">
                  Всё верно?
                </h1>
                <p className="mt-1.5 text-[15px] text-muted-foreground">
                  Проверь данные перед началом
                </p>

                <GlassCard
                  variant="solid"
                  pad="lg"
                  animateIn={false}
                  className="mt-6"
                >
                  <div className="flex flex-col items-center text-center">
                    <Avatar
                      name={draft.displayName}
                      src={telegramUser.photoUrl}
                      size={72}
                      ring
                    />
                    <h2 className="mt-3 text-xl font-extrabold tracking-tight text-foreground">
                      {draft.displayName}
                    </h2>
                    <p className="mt-1 text-sm font-semibold text-brand">
                      {confirmPosition?.title}
                    </p>
                  </div>

                  <div className="mt-5 flex flex-col gap-3 border-t border-border pt-5">
                    <div className="flex items-center gap-3">
                      <MapPin className="size-4 shrink-0 text-muted-foreground" />
                      <span className="text-[15px] font-semibold text-foreground">
                        {confirmCity?.name}
                      </span>
                    </div>
                    <div className="flex items-start gap-3">
                      <Building2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <p className="text-[15px] font-semibold text-foreground">
                          MetroFitness {confirmClub?.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {confirmClub?.address}
                          {confirmClub?.landmark
                            ? ` · ${confirmClub.landmark}`
                            : ""}
                        </p>
                      </div>
                    </div>
                  </div>
                </GlassCard>

                <p className="mt-4 px-1 text-xs leading-relaxed text-muted-foreground">
                  Эти данные используются для обучения, рейтингов и материалов
                  твоего клуба.
                </p>

                <div className="mt-6 flex flex-col gap-3">
                  <Button block size="lg" onClick={finish}>
                    Всё верно
                  </Button>
                  <Button
                    block
                    size="md"
                    variant="ghost"
                    onClick={() => goTo(0, -1)}
                  >
                    Изменить
                  </Button>
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </main>
  );
}
