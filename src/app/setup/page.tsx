"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Building2, Check, ChevronLeft, MapPin } from "lucide-react";
import { CITIES, POSITIONS, clubsForCity } from "@/lib/data";
import { useApp } from "@/providers/app-provider";
import { cn } from "@/lib/utils";
import { easeOutSoft, springSoft } from "@/lib/motion";
import { haptic, hapticSelection, hapticSuccess } from "@/lib/telegram";

type StepId = 0 | 1 | 2;

const STEPS: { title: string; hint: string }[] = [
  { title: "Выберите город", hint: "Где находится ваш клуб" },
  { title: "Выберите клуб", hint: "Ваша домашняя площадка Metro" },
  { title: "Выберите должность", hint: "Так мы подберём обучение" },
];

/** Generic selectable option row. */
function SelectCard({
  active,
  onClick,
  index,
  children,
}: {
  active: boolean;
  onClick: () => void;
  index: number;
  children: React.ReactNode;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, ...springSoft }}
      whileTap={{ scale: 0.98 }}
      className={cn(
        "flex w-full items-center gap-4 rounded-3xl border-2 p-4 text-left transition-colors",
        active
          ? "border-brand bg-brand/8"
          : "border-border bg-card hover:border-border-strong",
      )}
    >
      {children}
      <span
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
          active
            ? "border-brand bg-brand text-brand-foreground"
            : "border-border-strong",
        )}
      >
        {active && <Check className="size-4" strokeWidth={3} />}
      </span>
    </motion.button>
  );
}

export default function SetupScreen() {
  const router = useRouter();
  const { profile, updateProfile } = useApp();

  const [step, setStep] = useState<StepId>(0);
  const [dir, setDir] = useState(1);

  const clubs = useMemo(
    () => clubsForCity(profile.cityId),
    [profile.cityId],
  );

  const goTo = (next: StepId, direction: number) => {
    setDir(direction);
    setStep(next);
  };

  const back = () => {
    if (step === 0) {
      router.back();
      return;
    }
    haptic("light");
    goTo((step - 1) as StepId, -1);
  };

  const chooseCity = (cityId: string) => {
    hapticSelection();
    // Changing city invalidates a previously chosen club.
    updateProfile({ cityId, clubId: null });
    setTimeout(() => goTo(1, 1), 180);
  };

  const chooseClub = (clubId: string) => {
    hapticSelection();
    updateProfile({ clubId });
    setTimeout(() => goTo(2, 1), 180);
  };

  const choosePosition = (positionId: string) => {
    hapticSuccess();
    updateProfile({ positionId });
    setTimeout(() => router.replace("/home"), 260);
  };

  return (
    <main className="brand-aura flex min-h-[100dvh] flex-col px-6 pt-[calc(env(safe-area-inset-top)+14px)]">
      {/* Header + progress */}
      <div className="flex items-center gap-3">
        <motion.button
          type="button"
          whileTap={{ scale: 0.9 }}
          onClick={back}
          className="flex size-11 items-center justify-center rounded-2xl border border-border bg-card"
          aria-label="Назад"
        >
          <ChevronLeft className="size-5" />
        </motion.button>
        <div className="flex flex-1 gap-1.5">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
            >
              <motion.div
                className="h-full rounded-full bg-brand"
                initial={false}
                animate={{ width: i <= step ? "100%" : "0%" }}
                transition={{ duration: 0.4, ease: easeOutSoft }}
              />
            </div>
          ))}
        </div>
        <span className="w-10 text-right text-sm font-bold text-muted-foreground">
          {step + 1}/3
        </span>
      </div>

      {/* Step content */}
      <div className="relative mt-8 flex-1">
        <AnimatePresence mode="wait" custom={dir}>
          <motion.div
            key={step}
            custom={dir}
            initial={{ opacity: 0, x: dir * 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: dir * -40 }}
            transition={{ duration: 0.32, ease: easeOutSoft }}
          >
            <h1 className="text-[26px] font-extrabold tracking-tight text-foreground">
              {STEPS[step].title}
            </h1>
            <p className="mt-1.5 text-[15px] text-muted-foreground">
              {STEPS[step].hint}
            </p>

            <div className="mt-6 flex flex-col gap-3 pb-8">
              {step === 0 &&
                CITIES.map((city, i) => (
                  <SelectCard
                    key={city.id}
                    index={i}
                    active={profile.cityId === city.id}
                    onClick={() => chooseCity(city.id)}
                  >
                    <div className="flex size-12 items-center justify-center rounded-2xl bg-brand/12">
                      <MapPin className="size-5 text-foreground" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-bold text-foreground">
                        {city.name}
                      </p>
                      <p className="text-xs font-medium text-muted-foreground">
                        {city.clubsCount} клубов
                      </p>
                    </div>
                  </SelectCard>
                ))}

              {step === 1 &&
                clubs.map((club, i) => (
                  <SelectCard
                    key={club.id}
                    index={i}
                    active={profile.clubId === club.id}
                    onClick={() => chooseClub(club.id)}
                  >
                    <div className="flex size-12 items-center justify-center rounded-2xl bg-brand/12">
                      <Building2 className="size-5 text-foreground" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-bold text-foreground">
                        {club.name}
                      </p>
                      <p className="truncate text-xs font-medium text-muted-foreground">
                        {club.address}
                      </p>
                    </div>
                  </SelectCard>
                ))}

              {step === 2 &&
                POSITIONS.map((position, i) => {
                  const Icon = position.icon;
                  return (
                    <SelectCard
                      key={position.id}
                      index={i}
                      active={profile.positionId === position.id}
                      onClick={() => choosePosition(position.id)}
                    >
                      <div className="flex size-12 items-center justify-center rounded-2xl bg-brand/12">
                        <Icon className="size-5 text-foreground" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[15px] font-bold text-foreground">
                          {position.title}
                        </p>
                        <p className="text-xs font-medium text-muted-foreground">
                          {position.description}
                        </p>
                      </div>
                    </SelectCard>
                  );
                })}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </main>
  );
}
