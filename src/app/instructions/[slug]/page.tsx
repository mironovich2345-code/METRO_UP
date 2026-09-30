"use client";

import { use, useCallback } from "react";
import { motion } from "framer-motion";
import { AppHeader } from "@/components/app-header";
import { BottomNavigation } from "@/components/bottom-navigation";
import { RevalidatingBar } from "@/components/ui/revalidating-bar";
import { InstructionBlocksView } from "@/components/knowledge/InstructionBlocksView";
import { knowledgeApi } from "@/lib/api/knowledge-client";
import { useQuery, QUERY_POLICY } from "@/lib/client/query-cache";
import { cacheKeys } from "@/lib/client/cache-keys";

export default function InstructionDetailScreen({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const fetchInstruction = useCallback(() => knowledgeApi.instruction(slug).then((d) => d.instruction), [slug]);
  const { data: instruction, error, isLoading, isValidating } = useQuery(cacheKeys.instructionDetail(slug), fetchInstruction, QUERY_POLICY.LONG);
  const status: "loading" | "ready" | "error" = error ? "error" : !instruction && isLoading ? "loading" : instruction ? "ready" : "loading";

  return (
    <div className="relative min-h-[100dvh] pb-32">
      <AppHeader title="Инструкция" showBack backHref="/instructions" sticky />
      <RevalidatingBar show={Boolean(instruction) && isValidating} />
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
