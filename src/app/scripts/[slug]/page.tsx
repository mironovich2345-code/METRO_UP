"use client";

import { use, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ChevronDown, HelpCircle, Target, XCircle } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { BottomNavigation } from "@/components/bottom-navigation";
import { RichText } from "@/components/academy/lesson/RichText";
import { ApiError } from "@/lib/api/client";
import { knowledgeApi } from "@/lib/api/knowledge-client";
import type { ScriptDetailDTO } from "@/lib/api/knowledge-types";

export default function ScriptDetailScreen({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [script, setScript] = useState<ScriptDetailDTO | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "denied">("loading");

  useEffect(() => {
    knowledgeApi.script(slug)
      .then((d) => { setScript(d.script); setStatus("ready"); })
      .catch((e) => setStatus(e instanceof ApiError && e.status === 403 ? "denied" : e instanceof ApiError && e.status === 404 ? "error" : "error"));
  }, [slug]);

  return (
    <div className="relative min-h-[100dvh] pb-32">
      <AppHeader title="Скрипт" showBack backHref="/scripts" sticky />
      <main className="px-5 pt-2">
        {status === "loading" && <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-20 animate-pulse rounded-2xl bg-muted" />)}</div>}
        {status === "denied" && <p className="mt-8 text-center text-sm text-muted-foreground">Скрипты доступны менеджерам продаж.</p>}
        {status === "error" && <p className="mt-8 text-center text-sm text-muted-foreground">Скрипт не найден.</p>}
        {status === "ready" && script && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-brand">{script.categoryTitle}</p>
              <h1 className="mt-1 text-2xl font-extrabold leading-tight">{script.title}</h1>
              {script.description && <p className="mt-1 text-sm text-muted-foreground">{script.description}</p>}
            </div>

            {script.content.whenToUse && (
              <InfoRow icon={<HelpCircle className="size-4 text-brand" />} title="Когда использовать" text={script.content.whenToUse} />
            )}
            {script.content.goal && (
              <InfoRow icon={<Target className="size-4 text-brand" />} title="Цель разговора" text={script.content.goal} />
            )}

            {script.content.keyQuestions.length > 0 && (
              <Card title="Ключевые вопросы">
                <ul className="space-y-2">
                  {script.content.keyQuestions.map((q, i) => (
                    <li key={i} className="flex gap-2.5 text-[15px]">
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand/12 text-xs font-bold text-brand">{i + 1}</span>
                      <span className="pt-0.5">{q}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            {script.content.script.length > 0 && (
              <Collapsible title="Сценарий разговора" defaultOpen>
                <RichText doc={script.content.script} />
              </Collapsible>
            )}

            {script.content.doNotSay.length > 0 && (
              <Card title="Не говорить" tone="warn">
                <ul className="space-y-2">
                  {script.content.doNotSay.map((p, i) => (
                    <li key={i} className="flex gap-2.5 text-[15px]">
                      <XCircle className="mt-0.5 size-4 shrink-0 text-red-500" />
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            {script.content.nextStep && (
              <InfoRow icon={<Target className="size-4 text-brand" />} title="Следующий шаг" text={script.content.nextStep} />
            )}
          </motion.div>
        )}
      </main>
      <BottomNavigation />
    </div>
  );
}

function InfoRow({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="flex items-center gap-1.5 text-sm font-semibold">{icon}{title}</p>
      <p className="mt-1 text-[15px] leading-relaxed">{text}</p>
    </div>
  );
}

function Card({ title, children, tone }: { title: string; children: React.ReactNode; tone?: "warn" }) {
  return (
    <div className={`rounded-2xl border p-4 ${tone === "warn" ? "border-red-500/25 bg-red-500/5" : "border-border bg-card"}`}>
      <p className="mb-2 text-sm font-semibold">{title}</p>
      {children}
    </div>
  );
}

function Collapsible({ title, defaultOpen, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between px-4 py-3.5 text-left">
        <span className="text-sm font-bold">{title}</span>
        <ChevronDown className={`size-5 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="border-t border-border px-4 py-4">{children}</div>}
    </div>
  );
}
