"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, GraduationCap, MessageSquare, ScrollText } from "lucide-react";
import type { AppRole } from "@prisma/client";
import { adminApi, type AdminDashboard } from "@/lib/api/content-client";
import { controlAdminApi, type AdminAuditLogRow, type AdminQuestionsSummary } from "@/lib/api/control-admin-client";
import {
  LOG_CARD_REFRESH_MS,
  LOG_CARD_WINDOW_MINUTES,
  describeAuditAction,
  describeAuditContext,
  formatLogTime,
} from "@/lib/control/admin-dashboard";
import { questionCategoryLabel, questionStatusLabel } from "@/lib/client/questions-ui";

const ROLE_LABEL: Record<string, string> = { ADMIN: "Администратор", SPM: "СПМ", CLUB_MANAGER: "Управляющий" };

/**
 * Control Home. Sprint: LIVE QA QA-06 — for PROJECT_ADMIN (system access) an
 * operational dashboard of REAL data only:
 *   - «Логи — последние 5 минут»: UserAuditLog via the admin-only
 *     /api/control/logs, refreshed every 5 minutes by the card itself;
 *   - «Вопросы сотрудников»: EmployeeQuestion via listEmployeeQuestionsForActor
 *     (the existing anonymity rules apply);
 *   - «Обучение»: the existing adminApi.dashboard() counts.
 * Metric costs, frequent Metric questions and visit analytics are NOT shown:
 * the data they need is not recorded yet (see the QA-06 report) — no
 * placeholder numbers. SPM and every other role get the header only; nothing
 * admin-only is ever requested for them. Navigation stays in «Разделы».
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
  return (
    <div>
      <h1 className="text-2xl font-bold">METRO UP Control</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {displayName} · {ROLE_LABEL[role] ?? role}
      </p>

      {hasSystemAccess && (
        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <RecentLogsCard />
          <EmployeeQuestionsCard />
          <LearningCard />
        </div>
      )}
    </div>
  );
}

function Card({ icon: Icon, title, children, footer }: { icon: typeof ScrollText; title: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col rounded-3xl border border-border bg-card p-5">
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-brand/12">
          <Icon className="size-5 text-brand" aria-hidden />
        </span>
        <h2 className="text-lg font-bold">{title}</h2>
      </div>
      <div className="mt-4 flex-1">{children}</div>
      {footer && <div className="mt-3">{footer}</div>}
    </section>
  );
}

function MoreLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-brand hover:underline">
      {children} <ArrowRight className="size-4" aria-hidden />
    </Link>
  );
}

/** Rolling last-5-minutes audit events; re-fetches ONLY this card's data
 * every 5 minutes (no page reload), and stops when the card unmounts. */
export function RecentLogsCard() {
  const [rows, setRows] = useState<AdminAuditLogRow[] | null>(null);
  const [error, setError] = useState(false);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let alive = true;
    let controller: AbortController | null = null;
    const load = () => {
      controller?.abort();
      controller = new AbortController();
      controlAdminApi
        .logs({ sinceMinutes: LOG_CARD_WINDOW_MINUTES, limit: 10 }, controller.signal)
        .then((r) => {
          if (!alive) return;
          setRows(r.rows);
          setError(false);
          setNow(new Date());
        })
        .catch((e: unknown) => {
          if (alive && !(e instanceof DOMException && e.name === "AbortError")) setError(true);
        });
    };
    load();
    const timer = setInterval(load, LOG_CARD_REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(timer);
      controller?.abort();
    };
  }, []);

  return (
    <Card icon={ScrollText} title="Логи — последние 5 минут" footer={<MoreLink href="/control/logs">Все логи</MoreLink>}>
      {error && !rows ? (
        <p className="text-sm text-muted-foreground">Не удалось загрузить логи.</p>
      ) : !rows ? (
        <p className="text-sm text-muted-foreground">Загрузка…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">За последние 5 минут действий нет</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {rows.map((r) => {
            const context = describeAuditContext(r);
            return (
              <li key={r.id} className="py-2 first:pt-0">
                <p className="text-sm font-semibold [overflow-wrap:anywhere]">{describeAuditAction(r.action)}</p>
                <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
                  {r.actorName ?? "—"}
                  {context ? ` → ${context}` : ""} · {formatLogTime(r.createdAt, now)}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function EmployeeQuestionsCard() {
  const [data, setData] = useState<AdminQuestionsSummary | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    controlAdminApi
      .questionsSummary(controller.signal)
      .then(setData)
      .catch((e: unknown) => {
        if (!(e instanceof DOMException && e.name === "AbortError")) setError(true);
      });
    return () => controller.abort();
  }, []);

  return (
    <Card icon={MessageSquare} title="Вопросы сотрудников" footer={<MoreLink href="/questions">Все вопросы</MoreLink>}>
      {error ? (
        <p className="text-sm text-muted-foreground">Не удалось загрузить вопросы.</p>
      ) : !data ? (
        <p className="text-sm text-muted-foreground">Загрузка…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Новые" value={data.newCount} />
            <Stat label="В работе" value={data.inProgressCount} />
          </div>
          {data.latest.length > 0 && (
            <ul className="mt-3 flex flex-col divide-y divide-border">
              {data.latest.map((q) => (
                <li key={q.id} className="py-2">
                  <p className="line-clamp-2 text-sm [overflow-wrap:anywhere]">{q.text}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground [overflow-wrap:anywhere]">
                    {questionCategoryLabel(q.category)} · {q.authorDisplay}
                    {q.clubName ? ` · ${q.clubName}` : q.cityName ? ` · ${q.cityName}` : ""} · {questionStatusLabel(q.status)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Card>
  );
}

function LearningCard() {
  const [dash, setDash] = useState<AdminDashboard | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    adminApi
      .dashboard()
      .then(setDash)
      .catch(() => setError(true));
  }, []);

  return (
    <Card icon={GraduationCap} title="Обучение" footer={<MoreLink href="/admin/content">Открыть обучение</MoreLink>}>
      {dash ? (
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Программ" value={dash.totals.programs} />
          <Stat label="Опубликовано" value={dash.totals.lessonsPublished} />
          <Stat label="Черновиков" value={dash.totals.lessonsDraft} />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{error ? "Не удалось загрузить сводку." : "Загрузка…"}</p>
      )}
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0">
      <p className="text-2xl font-bold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">{label}</p>
    </div>
  );
}
