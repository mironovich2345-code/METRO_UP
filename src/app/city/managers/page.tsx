"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ShieldOff, UserCog } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { RevalidatingBar } from "@/components/ui/revalidating-bar";
import { ApiError } from "@/lib/api/client";
import { cabinetApi } from "@/lib/api/cabinet-client";
import { rolesApi } from "@/lib/api/roles-client";
import type { CityManagerDashboardDTO } from "@/lib/api/cabinet-client";
import { useQuery, QUERY_POLICY, invalidatePrefix } from "@/lib/client/query-cache";
import { cacheKeys, cacheKeyPrefixes } from "@/lib/client/cache-keys";
import { describeRoleAssignmentError } from "@/lib/cabinet-ui";
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
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  // Same underlying GET /api/control/cabinet/city-manager as /city — same
  // cache key, deliberately, so jumping between the two costs zero extra
  // requests (they render the SAME response two different ways).
  const { data: dashboard, error, isLoading, isValidating, mutate } = useQuery<CityManagerDashboardDTO>(
    cacheKeys.cityDashboard(),
    cabinetApi.cityManager,
    QUERY_POLICY.MUTABLE,
  );
  const status: "loading" | "ready" | "error" | "denied" =
    error instanceof ApiError && (error.status === 403 || error.status === 401)
      ? "denied"
      : error
        ? "error"
        : !dashboard && isLoading
          ? "loading"
          : dashboard
            ? "ready"
            : "loading";

  const revoke = async (assignmentId: string) => {
    setBusyId(assignmentId);
    setMsg(null);
    try {
      await rolesApi.revoke(assignmentId);
      // Section 7 — a revoked manager changes city dashboard/club
      // detail/managers list all at once; Home's own city_manager block
      // shows the same clubsWithoutManager/attention derivation too.
      invalidatePrefix(cacheKeyPrefixes.city);
      invalidatePrefix(cacheKeyPrefixes.home);
    } catch (e) {
      setMsg(describeRoleAssignmentError(e instanceof ApiError ? e.code : null));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="relative min-h-[100dvh] pb-24">
      <AppHeader title="Управляющие" showBack backHref="/city" showThemeSwitcher={false} />
      <RevalidatingBar show={Boolean(dashboard) && isValidating} />

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
            <Button className="mt-4" variant="secondary" onClick={() => mutate()}>Повторить</Button>
          </GlassCard>
        )}

        {status === "ready" && dashboard && (
          <>
            {msg && <p className="text-sm text-red-500">{msg}</p>}

            {/* Management UX Round D, section 6 — migrated from one
                GlassCard per row to a single pad="none" + divide-y
                container, same compact list pattern as /city/club and
                /city's own club list this round. Both icon treatments are
                now neutral (section 10 — a normal club/manager row is
                navigation/information, not an attention state; the
                previous brand/12 icon on assigned managers was exactly the
                "leftover decorative yellow" the audit asked to remove).
                Clubs WITHOUT a manager still come first — "Не назначен" +
                CTA into club detail (section 15: never silently omit them). */}
            {dashboard.clubs.length === 0 ? (
              <p className="px-1 text-sm text-muted-foreground">В вашей зоне пока нет клубов.</p>
            ) : (
              <motion.div variants={cardIn}>
                <GlassCard variant="solid" pad="none" animateIn={false} className="divide-y divide-border">
                  {dashboard.clubs
                    .filter((c) => !c.activeClubManager)
                    .map((c) => (
                      <div key={c.clubId} className="flex items-center gap-3 p-4">
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
                      </div>
                    ))}

                  {dashboard.clubManagers.map((cm) => (
                    <div key={cm.assignmentId} className="flex items-center gap-3 p-4">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-muted">
                        <UserCog className="size-4.5 text-muted-foreground" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{cm.displayName}</p>
                        <p className="truncate text-xs text-muted-foreground">{cm.clubName}</p>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => revoke(cm.assignmentId)} disabled={busyId === cm.assignmentId}>
                        <ShieldOff className="size-3.5" /> {busyId === cm.assignmentId ? "…" : "Снять"}
                      </Button>
                    </div>
                  ))}
                </GlassCard>
              </motion.div>
            )}
          </>
        )}
      </motion.main>
    </div>
  );
}
