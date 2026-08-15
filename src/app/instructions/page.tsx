"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ChevronRight, Search } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { BottomNavigation } from "@/components/bottom-navigation";
import { cardIn, staggerStack } from "@/lib/motion";
import { knowledgeApi } from "@/lib/api/knowledge-client";
import type { EmployeeInstructionsPayload } from "@/lib/api/knowledge-types";

export default function InstructionsScreen() {
  const [data, setData] = useState<EmployeeInstructionsPayload | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [q, setQ] = useState("");
  const [activeCat, setActiveCat] = useState("");

  useEffect(() => {
    knowledgeApi.instructions()
      .then((d) => { setData(d); setStatus("ready"); })
      .catch(() => setStatus("error"));
  }, []);

  const grouped = useMemo(() => {
    if (!data) return [];
    const term = q.trim().toLowerCase();
    const filtered = data.instructions.filter((i) => {
      if (activeCat && i.categoryId !== activeCat) return false;
      if (!term) return true;
      return i.title.toLowerCase().includes(term) || (i.summary ?? "").toLowerCase().includes(term);
    });
    return data.categories
      .map((c) => ({ category: c, items: filtered.filter((i) => i.categoryId === c.id) }))
      .filter((g) => g.items.length > 0);
  }, [data, q, activeCat]);

  return (
    <div className="relative min-h-[100dvh] pb-32">
      <AppHeader title="Инструкции" subtitle="Рабочие регламенты" showBack backHref="/knowledge" sticky />
      <main className="px-5 pt-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Найти инструкцию…" className="w-full rounded-2xl border border-border bg-card py-3 pl-10 pr-4 text-sm outline-none focus:border-brand" />
        </div>

        {status === "loading" && <div className="mt-4 space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded-2xl bg-muted" />)}</div>}
        {status === "error" && <p className="mt-8 text-center text-sm text-muted-foreground">Не удалось загрузить инструкции.</p>}
        {status === "ready" && data && data.instructions.length === 0 && <p className="mt-8 text-center text-sm text-muted-foreground">Инструкции пока не опубликованы.</p>}

        {status === "ready" && data && data.instructions.length > 0 && (
          <>
            {data.categories.length > 1 && (
              <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
                <Chip active={!activeCat} onClick={() => setActiveCat("")}>Все</Chip>
                {data.categories.map((c) => <Chip key={c.id} active={activeCat === c.id} onClick={() => setActiveCat(c.id)}>{c.title}</Chip>)}
              </div>
            )}
            <motion.div variants={staggerStack} initial="hidden" animate="show" className="mt-4 space-y-6">
              {grouped.length === 0 && <p className="mt-4 text-center text-sm text-muted-foreground">Ничего не найдено.</p>}
              {grouped.map((g) => (
                <div key={g.category.id}>
                  <p className="px-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">{g.category.title}</p>
                  <div className="mt-2 space-y-2">
                    {g.items.map((w) => (
                      <motion.div key={w.id} variants={cardIn}>
                        <Link href={`/instructions/${w.slug}`} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 transition-colors hover:border-brand/40">
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-semibold">{w.title}</p>
                            {w.summary && <p className="truncate text-sm text-muted-foreground">{w.summary}</p>}
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
    <button onClick={onClick} className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${active ? "bg-brand text-brand-foreground" : "border border-border bg-card text-muted-foreground"}`}>
      {children}
    </button>
  );
}
