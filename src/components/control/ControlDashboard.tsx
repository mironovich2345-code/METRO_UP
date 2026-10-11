"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, GraduationCap } from "lucide-react";
import type { AppRole } from "@prisma/client";
import { adminApi, type AdminDashboard } from "@/lib/api/content-client";

const ROLE_LABEL: Record<string, string> = { ADMIN: "Администратор", SPM: "СПМ", CLUB_MANAGER: "Управляющий" };

/**
 * Control Home. Sprint: LIVE QA QA-05.1 — Home answers «что сейчас имеет
 * состояние?», not «какие разделы существуют?». The former wall of 13
 * navigation-only cards is gone: every one of those destinations is in the
 * Control navigation (desktop sidebar / mobile «Разделы», control-nav.ts —
 * «Метрик», once Home-only, included since QA-05). What remains is the one
 * block that carried real live data — the learning summary — fed by the SAME
 * existing adminApi.dashboard() call as before (no new query, nothing
 * invented). QA-05.2 — no explanatory copy and no «Открыть разделы»: the
 * section selector sits directly above the page on mobile, the sidebar on
 * desktop.
 *
 * The role flags stay in the props for the page's existing call; only
 * `hasSystemAccess` decides anything here (the learning summary is a
 * system-access CMS read, exactly as its card was).
 */
export function ControlDashboard({
  displayName,
  role,
  hasSystemAccess,
}: {
  displayName: string;
  role: AppRole;
  hasSystemAccess: boolean;
  isCityManager?: boolean;
  isOperationsDirector?: boolean;
  isClubManager?: boolean;
}) {
  const [dash, setDash] = useState<AdminDashboard | null>(null);
  const [dashError, setDashError] = useState(false);

  useEffect(() => {
    if (hasSystemAccess) {
      adminApi
        .dashboard()
        .then(setDash)
        .catch(() => setDashError(true));
    }
  }, [hasSystemAccess]);

  return (
    <div>
      <h1 className="text-2xl font-bold">METRO UP Control</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {displayName} · {ROLE_LABEL[role] ?? role}
      </p>

      {hasSystemAccess && (
        <section className="mt-6 max-w-xl rounded-3xl border border-border bg-card p-5" aria-labelledby="home-learning-title">
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-brand/12">
              <GraduationCap className="size-5 text-brand" aria-hidden />
            </span>
            <h2 id="home-learning-title" className="text-lg font-bold">
              Обучение
            </h2>
          </div>
          {dash ? (
            <div className="mt-4 grid grid-cols-3 gap-3">
              <LearningStat label="Программ" value={dash.totals.programs} />
              <LearningStat label="Опубликовано" value={dash.totals.lessonsPublished} />
              <LearningStat label="Черновиков" value={dash.totals.lessonsDraft} />
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">{dashError ? "Не удалось загрузить сводку." : "Загрузка…"}</p>
          )}
          <Link href="/admin/content" className="mt-4 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-brand hover:underline">
            Открыть обучение <ArrowRight className="size-4" aria-hidden />
          </Link>
        </section>
      )}
    </div>
  );
}

function LearningStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0">
      <p className="text-2xl font-bold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">{label}</p>
    </div>
  );
}
