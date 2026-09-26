"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ShieldOff, UserCog } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api/client";
import { cabinetApi } from "@/lib/api/cabinet-client";
import { rolesApi } from "@/lib/api/roles-client";
import type { CityManagerDashboardDTO } from "@/lib/api/cabinet-client";
import { cardIn, staggerStack } from "@/lib/motion";

/**
 * Sprint: mini-app-role-experience, section 14 — CITY_MANAGER's
 * "Управляющие" Mini App screen. Same data as the desktop cabinet's
 * "Управляющие" table (CityManagerCabinet.tsx) — cabinetApi.cityManager(),
 * rolesApi.revoke — reused as-is. Assigning a manager to a club with none
 * happens on the club's own detail screen (/city/club) — one assign flow,
 * not duplicated here (section 13 owns "Назначить управляющего").
 */
export default function CityManagersPage() {
  const router = useRouter();
  const [dashboard, setDashboard] = useState<CityManagerDashboardDTO | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "denied">("loading");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(() => {
    setStatus("loading");
    cabinetApi
      .cityManager()
      .then((d) => {
        setDashboard(d);
        setStatus("ready");
      })
      .catch((e) => setStatus(e instanceof ApiError && (e.status === 403 || e.status === 401) ? "denied" : "error"));
  }, []);
  useEffect(load, [load]);

  const revoke = async (assignmentId: string) => {
    setBusyId(assignmentId);
    setMsg(null);
    try {
      await rolesApi.revoke(assignmentId);
      load();
    } catch {
      setMsg("Не удалось отозвать назначение.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="relative min-h-[100dvh] pb-24">
      <AppHeader title="Управляющие" showBack backHref="/city" showThemeSwitcher={false} />

      <motion.main variants={staggerStack} initial="hidden" animate="show" className="flex flex-col gap-4 px-5 pt-2">
        {status === "loading" && <div className="h-40 animate-pulse rounded-3xl bg-muted" />}
        {status === "denied" && (
          <GlassCard variant="solid" pad="lg" animateIn={false} className="text-center">
            <p className="font-semibold">Раздел доступен только Ст. города</p>
          </GlassCard>
        )}
        {status === "error" && (
          <GlassCard variant="solid" pad="lg" animateIn={false} className="text-center">
            <p className="font-semibold">Не удалось загрузить</p>
            <Button className="mt-4" variant="secondary" onClick={load}>Повторить</Button>
          </GlassCard>
        )}

        {status === "ready" && dashboard && (
          <>
            {msg && <p className="text-sm text-red-500">{msg}</p>}

            {/* Clubs WITHOUT a manager first — "Не назначен" + CTA into club detail
                (section 15: never silently omit them from this list). */}
            {dashboard.clubs
              .filter((c) => !c.activeClubManager)
              .map((c) => (
                <motion.div key={c.clubId} variants={cardIn}>
                  <GlassCard variant="solid" pad="md" animateIn={false} className="flex items-center gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-muted">
                      <UserCog className="size-4.5 text-muted-foreground" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-muted-foreground">Не назначен</p>
                      <p className="truncate text-xs text-muted-foreground">{c.clubName}</p>
                    </div>
                    <Button size="sm" variant="secondary" onClick={() => router.push(`/city/club?clubId=${c.clubId}`)}>
                      Назначить
                    </Button>
                  </GlassCard>
                </motion.div>
              ))}

            {dashboard.clubManagers.map((cm) => (
              <motion.div key={cm.assignmentId} variants={cardIn}>
                <GlassCard variant="solid" pad="md" animateIn={false} className="flex items-center gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-brand/12">
                    <UserCog className="size-4.5 text-brand" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{cm.displayName}</p>
                    <p className="truncate text-xs text-muted-foreground">{cm.clubName}</p>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => revoke(cm.assignmentId)} disabled={busyId === cm.assignmentId}>
                    <ShieldOff className="size-3.5" /> {busyId === cm.assignmentId ? "…" : "Снять"}
                  </Button>
                </GlassCard>
              </motion.div>
            ))}

            {dashboard.clubs.length === 0 && (
              <p className="px-1 text-sm text-muted-foreground">В вашей зоне пока нет клубов.</p>
            )}
          </>
        )}
      </motion.main>
    </div>
  );
}
