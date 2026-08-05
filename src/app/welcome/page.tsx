"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Check, Pencil, X } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { MetricCharacter } from "@/components/ui/metric-character";
import { useApp } from "@/providers/app-provider";
import {
  useTelegram,
  useTelegramMainButton,
} from "@/providers/TelegramProvider";
import { cardIn, easeOutSoft, staggerStack } from "@/lib/motion";
import { hapticSuccess } from "@/lib/telegram";

export default function WelcomeScreen() {
  const router = useRouter();
  const { telegramUser, profile, updateProfile } = useApp();
  const { isInsideTelegram } = useTelegram();

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(profile.displayName);

  // Inside Telegram, drive the flow with the native MainButton; in a browser we
  // fall back to the on-screen button below.
  useTelegramMainButton(
    isInsideTelegram && !editing
      ? { text: "Далее", onClick: () => router.push("/setup") }
      : null,
  );

  const save = () => {
    const name = draft.trim();
    if (name) {
      updateProfile({ displayName: name });
      hapticSuccess();
    } else {
      setDraft(profile.displayName);
    }
    setEditing(false);
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
          <MetricCharacter size={112} mood="happy" />
        </motion.div>

        <motion.div variants={cardIn} className="mt-8 text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-brand">
            MetroFitness
          </p>
          <h1 className="mt-2 text-[32px] font-extrabold leading-tight tracking-tight text-foreground">
            Добро пожаловать
          </h1>
          <p className="mx-auto mt-3 max-w-[280px] text-[15px] text-muted-foreground">
            Я Метрик — твой напарник в обучении. Давай настроим профиль за минуту.
          </p>
        </motion.div>

        <motion.div variants={cardIn} className="mt-8">
          <GlassCard variant="solid" pad="md" animateIn={false}>
            <div className="flex items-center gap-4">
              <Avatar
                name={profile.displayName}
                src={telegramUser?.photoUrl}
                size={56}
                ring
              />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Отображаемое имя
                </p>

                <AnimatePresence mode="wait" initial={false}>
                  {editing ? (
                    <motion.div
                      key="edit"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="mt-1 flex items-center gap-2"
                    >
                      <input
                        autoFocus
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && save()}
                        maxLength={32}
                        className="w-full min-w-0 border-b-2 border-brand bg-transparent pb-0.5 text-lg font-bold text-foreground outline-none"
                      />
                    </motion.div>
                  ) : (
                    <motion.p
                      key="view"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="mt-0.5 truncate text-lg font-bold text-foreground"
                    >
                      {profile.displayName}
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>

              {editing ? (
                <div className="flex shrink-0 gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setDraft(profile.displayName);
                      setEditing(false);
                    }}
                    className="flex size-9 items-center justify-center rounded-xl bg-muted text-muted-foreground"
                    aria-label="Отменить"
                  >
                    <X className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={save}
                    className="flex size-9 items-center justify-center rounded-xl bg-brand text-brand-foreground"
                    aria-label="Сохранить"
                  >
                    <Check className="size-4" strokeWidth={3} />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setDraft(profile.displayName);
                    setEditing(true);
                  }}
                  className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground"
                  aria-label="Изменить имя"
                >
                  <Pencil className="size-4" />
                </button>
              )}
            </div>
          </GlassCard>
        </motion.div>
      </motion.div>

      {!isInsideTelegram && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.6, ease: easeOutSoft }}
          className="pb-[calc(env(safe-area-inset-bottom)+24px)] pt-6"
        >
          <Button block size="lg" onClick={() => router.push("/setup")}>
            Далее
            <ArrowRight className="size-5" />
          </Button>
        </motion.div>
      )}
    </main>
  );
}
