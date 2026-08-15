"use client";

import { use, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { AppHeader } from "@/components/app-header";
import { BottomNavigation } from "@/components/bottom-navigation";
import { ApiError } from "@/lib/api/client";
import { metricApi } from "@/lib/api/metric-client";
import type { EmployeeDocumentDTO } from "@/lib/api/metric-types";

export default function DocumentViewerScreen({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [doc, setDoc] = useState<EmployeeDocumentDTO | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "denied" | "error">("loading");

  useEffect(() => {
    metricApi.document(id)
      .then((d) => { setDoc(d.document); setStatus("ready"); })
      .catch((e) => setStatus(e instanceof ApiError && e.status === 403 ? "denied" : "error"));
  }, [id]);

  return (
    <div className="relative min-h-[100dvh] pb-32">
      <AppHeader title="Документ" showBack backHref="/knowledge" sticky />
      <main className="px-5 pt-2">
        {status === "loading" && <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-20 animate-pulse rounded-2xl bg-muted" />)}</div>}
        {status === "denied" && <p className="mt-8 text-center text-sm text-muted-foreground">Этот документ недоступен для вашей должности.</p>}
        {status === "error" && <p className="mt-8 text-center text-sm text-muted-foreground">Документ не найден.</p>}
        {status === "ready" && doc && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-brand">{doc.categoryLabel}</p>
              <h1 className="mt-1 text-2xl font-extrabold leading-tight">{doc.title}</h1>
              {doc.description && <p className="mt-1 text-sm text-muted-foreground">{doc.description}</p>}
              <p className="mt-2 text-xs text-muted-foreground">
                {doc.versionLabel ? `${doc.versionLabel} · ` : ""}обновлён {new Date(doc.updatedAt).toLocaleDateString("ru-RU")}
              </p>
            </div>
            <article className="whitespace-pre-line rounded-2xl border border-border bg-card p-4 text-[15px] leading-relaxed">
              {doc.text}
            </article>
          </motion.div>
        )}
      </main>
      <BottomNavigation />
    </div>
  );
}
