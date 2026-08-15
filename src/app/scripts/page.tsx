"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ChevronRight, Search } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { BottomNavigation } from "@/components/bottom-navigation";
import { cardIn, staggerStack } from "@/lib/motion";
import { ApiError } from "@/lib/api/client";
import { knowledgeApi } from "@/lib/api/knowledge-client";
import type { EmployeeScriptsPayload } from "@/lib/api/knowledge-types";

export default function ScriptsScreen() {
  const [data, setData] = useState<EmployeeScriptsPayload | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "denied">("loading");
  const [q, setQ] = useState("");
  const [activeCat, setActiveCat] = useState<string>("");

  useEffect(() => {
    knowledgeApi.scripts()
      .then((d) => { setData(d); setStatus("ready"); })
      .catch((e) => setStatus(e instanceof ApiError && e.status === 403 ? "denied" : "error"));
  }, []);

  const filtered = useMemo(() => {
    if (!data) return [];
    const term = q.trim().toLowerCase();
    return data.scripts.filter((s) => {
      if (activeCat && s.categoryId !== activeCat) return false;
      if (!term) return true;
      return s.title.toLowerCase().includes(term) || (s.description ?? "").toLowerCase().includes(term);
    });
  }, [data, q, activeCat]);

  const grouped = useMemo(() => {
    if (!data) return [];
    return data.categories
      .map((c) => ({ category: c, items: filtered.filter((s) => s.categoryId === c.id) }))
      .filter((g) => g.items.length > 0);
  }, [data, filtered]);

  return (
    <div className="relative min-h-[100dvh] pb-32">
      <AppHeader title="Скрипты" subtitle="Сценарии разговоров" showBack sticky />

      <main className="px-5 pt-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Найти скрипт…"
            className="w-full rounded-2xl border border-border bg-card py-3 pl-10 pr-4 text-sm outline-none focus:border-brand"
          />
        </div>

        {status === "loading" && (
          <div className="mt-4 space-y-3">
            {[0, 1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded-2xl bg-muted" />)}
          </div>
        )}
        {status === "denied" && <EmptyNote text="Скрипты доступны менеджерам продаж." />}
        {status === "error" && <EmptyNote text="Не удалось загрузить скрипты." />}
        {status === "ready" && data && data.scripts.length === 0 && <EmptyNote text="Скрипты пока не опубликованы." />}

        {status === "ready" && data && data.scripts.length > 0 && (
          <>
            {data.categories.length > 1 && (
              <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
                <Chip active={!activeCat} onClick={() => setActiveCat("")}>Все</Chip>
                {data.categories.map((c) => (
                  <Chip key={c.id} active={activeCat === c.id} onClick={() => setActiveCat(c.id)}>{c.title}</Chip>
                ))}
              </div>
            )}

            <motion.div variants={staggerStack} initial="hidden" animate="show" className="mt-4 space-y-6">
              {grouped.length === 0 && <EmptyNote text="Ничего не найдено." />}
              {grouped.map((g) => (
                <div key={g.category.id}>
                  <p className="px-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">{g.category.title}</p>
                  <div className="mt-2 space-y-2">
                    {g.items.map((s) => (
                      <motion.div key={s.id} variants={cardIn}>
                        <Link href={`/scripts/${s.slug}`} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 transition-colors hover:border-brand/40">
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-semibold">{s.title}</p>
                            {s.description && <p className="truncate text-sm text-muted-foreground">{s.description}</p>}
                          </div>
                          <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
                        </Link>
                      </motion.div>
                    ))}
                  </div>
                </div>
              ))}
            </motion.div>
          </>
        )}
      </main>
      <BottomNavigation />
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${active ? "bg-brand text-brand-foreground" : "border border-border bg-card text-muted-foreground"}`}
    >
      {children}
    </button>
  );
}

function EmptyNote({ text }: { text: string }) {
  return <p className="mt-8 text-center text-sm text-muted-foreground">{text}</p>;
}
