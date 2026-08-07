"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Pencil, X } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Logo } from "@/components/brand/logo";
import { NameEditSheet } from "@/components/onboarding/name-edit-sheet";
import { useApp } from "@/providers/app-provider";
import { useTelegram } from "@/providers/TelegramProvider";
import { cardIn, easeOutSoft, staggerStack } from "@/lib/motion";

const HINT_KEY = "metro.welcome.hintSeen";

export default function WelcomeScreen() {
  const router = useRouter();
  const { telegramUser, draft, setDisplayName } = useApp();
  const { isInsideTelegram } = useTelegram();

  const [editing, setEditing] = useState(false);
  const [showHint, setShowHint] = useState(false);

  // One-time hint: shown once, then never again after being dismissed.
  useEffect(() => {
    try {
      if (!localStorage.getItem(HINT_KEY)) setShowHint(true);
    } catch {
      /* storage unavailable — skip hint */
    }
  }, []);

  const dismissHint = () => {
    setShowHint(false);
    try {
      localStorage.setItem(HINT_KEY, "1");
    } catch {
      /* noop */
    }
  };

  return (
    <main className="brand-aura flex min-h-[100dvh] flex-col px-6 pt-[calc(env(safe-area-inset-top)+40px)]">
      <motion.div
        variants={staggerStack}
        initial="hidden"
        animate="show"
        className="flex flex-1 flex-col"
      >
        <motion.div variants={cardIn} className="flex justify-center">
          <Logo size="lg" />
        </motion.div>

        <motion.div variants={cardIn} className="mt-10 text-center">
          <h1 className="text-[32px] font-extrabold leading-tight tracking-tight text-foreground">
            Добро пожаловать в Metro
          </h1>
          <p className="mx-auto mt-3 max-w-[280px] text-[15px] text-muted-foreground">
            Давай настроим твой профиль
          </p>
        </motion.div>

        {/* Avatar + editable name card */}
        <motion.div variants={cardIn} className="mt-10 flex flex-col items-center">
          <Avatar
            name={draft.displayName || telegramUser.firstName}
            src={telegramUser.photoUrl}
            size={80}
            ring
          />

          <div className="relative mt-5 w-full">
            <GlassCard variant="solid" pad="md" animateIn={false}>
              <button
                type="button"
                onClick={() => {
                  dismissHint();
                  setEditing(true);
                }}
                className="flex w-full items-center gap-4 text-left"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-lg font-bold text-foreground">
                    {draft.displayName}
                  </p>
                  <p className="text-xs font-medium text-muted-foreground">
                    Имя из Telegram
                  </p>
                </div>
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand/15 text-foreground">
                  <Pencil className="size-4" />
                </span>
              </button>
            </GlassCard>

            {/* One-time hint */}
            <AnimatePresence>
              {showHint && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.3, ease: easeOutSoft }}
                  className="absolute inset-x-0 top-[calc(100%+10px)] z-10"
                >
                  <div className="flex items-start gap-2 rounded-2xl bg-foreground px-4 py-3 text-background shadow-lg">
                    <p className="flex-1 text-xs font-medium leading-snug">
                      Это имя будут видеть коллеги. При необходимости его можно
                      изменить.
                    </p>
                    <button
                      type="button"
                      onClick={dismissHint}
                      className="-mr-1 -mt-0.5 shrink-0 rounded-lg p-0.5 opacity-70"
                      aria-label="Понятно"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.6, ease: easeOutSoft }}
        className="pb-[calc(env(safe-area-inset-bottom)+24px)] pt-6"
      >
        <Button block size="lg" onClick={() => router.push("/setup")}>
          Продолжить
          <ArrowRight className="size-5" />
        </Button>
        {isInsideTelegram && (
          <p className="mt-3 text-center text-xs text-muted-foreground">
            Профиль хранится только в Metro UP
          </p>
        )}
      </motion.div>

      <NameEditSheet
        open={editing}
        initialName={draft.displayName}
        onSave={setDisplayName}
        onClose={() => setEditing(false)}
      />
    </main>
  );
}
