"use client";

import { motion } from "framer-motion";
import { X } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { MetricCharacter } from "@/components/ui/metric-character";

interface FirstRunWelcomeProps {
  name: string;
  onStart: () => void;
  onDismiss: () => void;
}

/** One-time welcome shown on the first Home open after onboarding. */
export function FirstRunWelcome({
  name,
  onStart,
  onDismiss,
}: FirstRunWelcomeProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <GlassCard variant="solid" pad="lg" animateIn={false} className="relative">
        <button
          type="button"
          onClick={onDismiss}
          className="absolute right-4 top-4 flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground"
          aria-label="Закрыть"
        >
          <X className="size-4" />
        </button>

        <div className="flex flex-col items-center text-center">
          <MetricCharacter size={72} mood="cheer" />
          <h2 className="mt-3 text-xl font-extrabold tracking-tight text-foreground">
            Отлично, {name}!
          </h2>
          <p className="mt-1.5 max-w-[260px] text-sm text-muted-foreground">
            Профиль готов. Теперь пройдём твою базовую адаптацию.
          </p>
          <p className="mt-2 text-xs font-semibold text-brand">
            3 дня · около 15 минут за смену
          </p>
          <Button block size="md" className="mt-5" onClick={onStart}>
            Начать обучение
          </Button>
        </div>
      </GlassCard>
    </motion.div>
  );
}
