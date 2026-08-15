"use client";

import { use, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { AppHeader } from "@/components/app-header";
import { BottomNavigation } from "@/components/bottom-navigation";
import { InstructionBlocksView } from "@/components/knowledge/InstructionBlocksView";
import { ApiError } from "@/lib/api/client";
import { knowledgeApi } from "@/lib/api/knowledge-client";
import type { InstructionDetailDTO } from "@/lib/api/knowledge-types";

export default function InstructionDetailScreen({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [instruction, setInstruction] = useState<InstructionDetailDTO | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    knowledgeApi.instruction(slug)
      .then((d) => { setInstruction(d.instruction); setStatus("ready"); })
      .catch((e) => setStatus(e instanceof ApiError ? "error" : "error"));
  }, [slug]);

  return (
    <div className="relative min-h-[100dvh] pb-32">
      <AppHeader title="Инструкция" showBack sticky />
      <main className="px-5 pt-2">
        {status === "loading" && <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-20 animate-pulse rounded-2xl bg-muted" />)}</div>}
        {status === "error" && <p className="mt-8 text-center text-sm text-muted-foreground">Инструкция не найдена.</p>}
        {status === "ready" && instruction && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-brand">{instruction.categoryTitle}</p>
              <h1 className="mt-1 text-2xl font-extrabold leading-tight">{instruction.title}</h1>
              {instruction.summary && <p className="mt-1 text-sm text-muted-foreground">{instruction.summary}</p>}
              <p className="mt-2 text-xs text-muted-foreground">Обновлено {new Date(instruction.updatedAt).toLocaleDateString("ru-RU")}</p>
            </div>
            <InstructionBlocksView blocks={instruction.blocks} />
          </motion.div>
        )}
      </main>
      <BottomNavigation />
    </div>
  );
}
