"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, BookOpen, ScrollText } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { BottomNavigation } from "@/components/bottom-navigation";
import { cardIn, staggerStack } from "@/lib/motion";
import { useApp } from "@/providers/app-provider";

const SCRIPT_POSITIONS = ["CLIENT_MANAGER", "NIGHT_MANAGER"];

/** Employee knowledge hub — one entry point, avoids overloading the bottom nav. */
export default function KnowledgeHub() {
  const { profile } = useApp();
  const canScripts = !!profile?.positionId && SCRIPT_POSITIONS.includes(profile.positionId);

  return (
    <div className="relative min-h-[100dvh] pb-32">
      <AppHeader title="База знаний" subtitle="Скрипты и рабочие инструкции" />
      <motion.main variants={staggerStack} initial="hidden" animate="show" className="flex flex-col gap-4 px-5 pt-2">
        {canScripts && (
          <HubCard
            href="/scripts"
            icon={<ScrollText className="size-6 text-brand" />}
            title="Скрипты"
            description="Готовые сценарии разговоров: первичный контакт, продажа, возражения, повторный контакт."
          />
        )}
        <HubCard
          href="/instructions"
          icon={<BookOpen className="size-6 text-brand" />}
          title="Инструкции"
          description="Рабочие регламенты: оформление договоров, касса, гостевой визит и другие процессы."
        />
      </motion.main>
      <BottomNavigation />
    </div>
  );
}

function HubCard({ href, icon, title, description }: { href: string; icon: React.ReactNode; title: string; description: string }) {
  return (
    <motion.div variants={cardIn}>
      <Link href={href} className="group flex items-start gap-4 rounded-3xl border border-border bg-card p-5 transition-colors hover:border-brand/40">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-brand/12">{icon}</span>
        <div className="min-w-0 flex-1">
          <p className="text-lg font-bold">{title}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        </div>
        <ArrowRight className="mt-1 size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </Link>
    </motion.div>
  );
}
