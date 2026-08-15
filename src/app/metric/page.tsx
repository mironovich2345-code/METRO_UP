"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { AlertCircle, BookOpen, ChevronDown, FileText, GraduationCap, RotateCcw, ScrollText, Send } from "lucide-react";
import { MetricCharacter } from "@/components/ui/metric-character";
import { BottomNavigation } from "@/components/bottom-navigation";
import { cardIn, staggerStack } from "@/lib/motion";
import { hapticSelection } from "@/lib/telegram";
import { useApp } from "@/providers/app-provider";
import { ApiError } from "@/lib/api/client";
import { metricApi } from "@/lib/api/metric-client";
import { isClickableSource } from "@/lib/metric-source";
import type { MetricMessageDTO, MetricSourceDTO } from "@/lib/api/metric-types";

const SUGGESTIONS = [
  "Что входит в клубную карту?",
  "Как обработать заявку с сайта?",
  "Что сказать клиенту про пробное посещение?",
  "Объясни преимущества MetroFitness",
];

const SOURCE_META: Record<MetricSourceDTO["sourceType"], { label: string; icon: typeof BookOpen }> = {
  ACADEMY: { label: "Академия", icon: GraduationCap },
  SCRIPT: { label: "Скрипт", icon: ScrollText },
  INSTRUCTION: { label: "Инструкция", icon: BookOpen },
  DOCUMENT: { label: "Документ", icon: FileText },
};

export default function MetricScreen() {
  const { profile } = useApp();
  const firstName = profile?.displayName?.split(" ")[0] ?? "";
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [ready, setReady] = useState(true);
  const [messages, setMessages] = useState<MetricMessageDTO[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    metricApi.conversation()
      .then((c) => { setMessages(c.messages); setConversationId(c.conversationId); setReady(c.ready); setStatus("ready"); })
      .catch(() => setStatus("error"));
  }, []);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, sending]);

  const send = useCallback(async (raw: string) => {
    const text = raw.trim();
    if (!text || sending || !ready) return;
    hapticSelection();
    setSendError(null);
    setInput("");
    // Optimistic user bubble.
    const optimistic: MetricMessageDTO = { id: `local-${Date.now()}`, role: "USER", content: text, sources: [], isTruncated: false, createdAt: new Date().toISOString() };
    setMessages((m) => [...m, optimistic]);
    setSending(true);
    try {
      const r = await metricApi.chat(text, conversationId ?? undefined);
      setConversationId(r.conversationId);
      // Replace optimistic with the real pair by refetching would be heavy; just append the assistant.
      setMessages((m) => [...m, r.message]);
    } catch (e) {
      setMessages((m) => m.filter((x) => x.id !== optimistic.id));
      setInput(text);
      if (e instanceof ApiError && e.status === 429) setSendError("Слишком много сообщений подряд. Подожди немного.");
      else if (e instanceof ApiError && e.status === 503) { setReady(false); setSendError(null); }
      else setSendError("Не удалось получить ответ. Попробуй ещё раз.");
    } finally {
      setSending(false);
    }
  }, [sending, ready, conversationId]);

  const onContinue = async () => {
    if (sending || !conversationId) return;
    setSendError(null);
    setSending(true);
    try {
      const r = await metricApi.continue(conversationId);
      setMessages((m) => m.map((x) => (x.id === r.message.id ? r.message : x)));
    } catch {
      setSendError("Не удалось продолжить ответ. Попробуй ещё раз.");
    } finally {
      setSending(false);
    }
  };

  const empty = messages.length === 0;
  const last = messages[messages.length - 1];
  const canContinue = !sending && last?.role === "ASSISTANT" && last.isTruncated;

  return (
    <div className="relative flex min-h-[100dvh] flex-col pb-[calc(env(safe-area-inset-bottom)+150px)]">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border/60 bg-background/85 px-5 pb-3 pt-[calc(env(safe-area-inset-top)+12px)] backdrop-blur-xl">
        <span className="overflow-visible"><MetricCharacter size={40} animated={false} /></span>
        <div className="min-w-0 flex-1">
          <p className="text-base font-extrabold leading-tight">Метрик</p>
          <p className="truncate text-xs text-muted-foreground">ИИ-помощник METRO UP</p>
        </div>
      </header>

      <main className="flex-1 px-4 pt-4">
        {status === "loading" && <div className="space-y-3">{[0, 1].map((i) => <div key={i} className="h-16 animate-pulse rounded-2xl bg-muted" />)}</div>}
        {status === "error" && <p className="mt-8 text-center text-sm text-muted-foreground">Не удалось загрузить Метрика.</p>}

        {status === "ready" && !ready && (
          <div className="mt-6 rounded-3xl border border-border bg-card p-6 text-center">
            <p className="font-semibold">Метрик временно недоступен</p>
            <p className="mt-1 text-sm text-muted-foreground">Скоро снова сможет отвечать на вопросы.</p>
          </div>
        )}

        {status === "ready" && ready && empty && (
          <motion.div variants={staggerStack} initial="hidden" animate="show" className="space-y-5">
            <motion.div variants={cardIn} className="rounded-3xl border border-border bg-card p-5">
              <p className="text-[15px] leading-relaxed">
                Привет{firstName ? `, ${firstName}` : ""} 👋<br />
                Я Метрик. Можешь спросить меня о работе, обучении или ситуации с клиентом.
              </p>
              <p className="mt-2 text-sm text-muted-foreground">Помогу разобраться в работе, продукте и стандартах MetroFitness.</p>
            </motion.div>
            <motion.div variants={cardIn} className="space-y-2">
              {SUGGESTIONS.map((q) => (
                <button key={q} onClick={() => send(q)} className="flex w-full items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 text-left text-[15px] transition-colors hover:border-brand/40">
                  {q}
                </button>
              ))}
            </motion.div>
          </motion.div>
        )}

        {status === "ready" && !empty && (
          <div className="space-y-4">
            {messages.map((m) => <MessageBubble key={m.id} message={m} />)}
            {canContinue && (
              <div className="flex justify-start">
                <button onClick={onContinue} className="flex items-center gap-1.5 rounded-2xl border border-brand/40 bg-brand/10 px-4 py-2 text-sm font-semibold text-brand">
                  <ChevronDown className="size-4" /> Продолжить ответ
                </button>
              </div>
            )}
            {sending && <TypingBubble />}
            {sendError && (
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3">
                <span className="flex items-center gap-2 text-sm text-muted-foreground"><AlertCircle className="size-4" /> {sendError}</span>
                <button onClick={() => send(input)} disabled={!input.trim()} className="flex items-center gap-1 rounded-xl bg-brand px-3 py-1.5 text-sm font-semibold text-brand-foreground disabled:opacity-40">
                  <RotateCcw className="size-3.5" /> Ещё раз
                </button>
              </div>
            )}
          </div>
        )}
        <div ref={bottomRef} />
      </main>

      {/* Composer above the bottom nav */}
      <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+92px)] z-30 px-4">
        <div className="mx-auto flex max-w-[460px] items-end gap-2 rounded-2xl border border-border bg-card p-1.5 shadow-[var(--shadow-float)]">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value.slice(0, 2000))}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
            placeholder={ready ? "Спроси Метрика…" : "Метрик временно недоступен"}
            rows={1}
            disabled={!ready || sending}
            className="max-h-28 min-h-[40px] min-w-0 flex-1 resize-none bg-transparent px-3 py-2 text-[15px] text-foreground outline-none placeholder:text-muted-foreground disabled:opacity-60"
          />
          <button
            onClick={() => send(input)}
            disabled={!ready || sending || !input.trim()}
            aria-label="Отправить"
            className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand text-brand-foreground transition-opacity disabled:opacity-40"
          >
            <Send className="size-4" />
          </button>
        </div>
      </div>

      <BottomNavigation />
    </div>
  );
}

function MessageBubble({ message }: { message: MetricMessageDTO }) {
  const isUser = message.role === "USER";
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className={isUser ? "flex justify-end" : "flex justify-start"}>
      <div className={isUser ? "max-w-[85%] rounded-2xl rounded-br-md bg-brand px-4 py-2.5 text-[15px] text-brand-foreground" : "max-w-[92%] space-y-2"}>
        {isUser ? (
          <p className="whitespace-pre-line">{message.content}</p>
        ) : (
          <>
            <div className="rounded-2xl rounded-bl-md border border-border bg-card px-4 py-3 text-[15px] leading-relaxed">
              <p className="whitespace-pre-line">{message.content}</p>
            </div>
            {message.sources.length > 0 && (
              <div className="space-y-1.5">
                <p className="px-1 text-xs font-semibold text-muted-foreground">Источники</p>
                {message.sources.map((s, i) => {
                  const meta = SOURCE_META[s.sourceType];
                  const Icon = meta.icon;
                  const inner = (
                    <>
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-brand/12"><Icon className="size-4 text-brand" /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs font-semibold text-muted-foreground">{meta.label}</span>
                        <span className="block truncate text-sm font-medium">{s.title}</span>
                      </span>
                    </>
                  );
                  // Documents are attribution-only — not clickable, no link affordance.
                  return isClickableSource(s.sourceType) ? (
                    <Link key={i} href={s.href} className="flex items-center gap-2.5 rounded-2xl border border-border bg-card px-3 py-2.5 transition-colors hover:border-brand/40">
                      {inner}
                    </Link>
                  ) : (
                    <div key={i} className="flex items-center gap-2.5 rounded-2xl border border-border bg-card px-3 py-2.5">
                      {inner}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </motion.div>
  );
}

function TypingBubble() {
  return (
    <div className="flex justify-start">
      <div className="flex items-center gap-1 rounded-2xl rounded-bl-md border border-border bg-card px-4 py-3">
        {[0, 1, 2].map((i) => (
          <motion.span key={i} className="size-2 rounded-full bg-muted-foreground/60" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }} />
        ))}
      </div>
    </div>
  );
}
