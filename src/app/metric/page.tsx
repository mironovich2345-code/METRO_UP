"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Send } from "lucide-react";
import { MetricCharacter } from "@/components/ui/metric-character";
import { BottomNavigation } from "@/components/bottom-navigation";
import { cardIn, staggerStack } from "@/lib/motion";
import { hapticSelection } from "@/lib/telegram";

/**
 * Metric — UI foundation for the future Metric AI. No LLM / API / RAG is wired
 * up yet: sending never fabricates an answer, it only shows a neutral
 * "coming soon" note. The layout is the real screen the AI will later plug into.
 */
const EXAMPLES = [
  "Что входит в клубную карту?",
  "Как обработать заявку с сайта?",
  "Что сказать клиенту про пробное посещение?",
  "Как действовать в этой ситуации?",
];

export default function MetricScreen() {
  const [input, setInput] = useState("");
  const [notice, setNotice] = useState(false);

  const send = () => {
    if (!input.trim()) return;
    hapticSelection();
    setNotice(true); // no fake AI response — neutral not-ready state only
  };

  return (
    <div className="relative min-h-[100dvh] pb-44">
      <motion.main
        variants={staggerStack}
        initial="hidden"
        animate="show"
        className="flex flex-col items-center px-5 pt-[calc(env(safe-area-inset-top)+28px)] text-center"
      >
        {/* Headroom + overflow-visible so the mascot's marker above its head is not clipped */}
        <motion.div variants={cardIn} className="overflow-visible pt-2">
          <MetricCharacter size={108} mood="happy" />
        </motion.div>

        <motion.span variants={cardIn} className="mt-4 rounded-full bg-brand/12 px-3 py-1 text-xs font-semibold text-brand">
          Скоро
        </motion.span>
        <motion.h1 variants={cardIn} className="mt-3 text-2xl font-extrabold tracking-tight">Метрик</motion.h1>
        <motion.p variants={cardIn} className="mt-0.5 text-sm font-medium text-muted-foreground">ИИ-помощник METRO UP</motion.p>
        <motion.p variants={cardIn} className="mt-3 max-w-[320px] text-[15px] leading-relaxed text-muted-foreground">
          Помогу найти ответ по работе, обучению и стандартам MetroFitness.
        </motion.p>

        <motion.div variants={cardIn} className="mt-7 w-full max-w-[440px]">
          <p className="px-1 pb-2 text-left text-xs font-bold uppercase tracking-wide text-muted-foreground">Примеры вопросов</p>
          <div className="space-y-2">
            {EXAMPLES.map((q) => (
              <button
                key={q}
                onClick={() => { hapticSelection(); setInput(q); setNotice(false); }}
                className="flex w-full items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 text-left text-[15px] transition-colors hover:border-brand/40"
              >
                <span className="min-w-0 flex-1">{q}</span>
              </button>
            ))}
          </div>
        </motion.div>
      </motion.main>

      {/* Composer — sits above the bottom nav; sending shows a neutral note only. */}
      <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+96px)] z-30 px-4">
        <div className="mx-auto max-w-[460px]">
          {notice && (
            <div className="mb-2 rounded-2xl border border-border bg-card px-4 py-2.5 text-center text-sm text-muted-foreground shadow-[var(--shadow-float)]">
              Метрик скоро будет готов отвечать на вопросы.
            </div>
          )}
          <div className="flex items-center gap-2 rounded-2xl border border-border bg-card p-1.5 shadow-[var(--shadow-float)]">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") send(); }}
              placeholder="Спросите Метрика…"
              className="min-w-0 flex-1 bg-transparent px-3 py-2 text-[15px] text-foreground outline-none placeholder:text-muted-foreground"
            />
            <button
              onClick={send}
              disabled={!input.trim()}
              aria-label="Отправить"
              className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand text-brand-foreground transition-opacity disabled:opacity-40"
            >
              <Send className="size-4" />
            </button>
          </div>
        </div>
      </div>

      <BottomNavigation />
    </div>
  );
}
