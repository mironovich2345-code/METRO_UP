"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ChevronRight, MessageSquareOff } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { BottomNavigation } from "@/components/bottom-navigation";
import { ManagementAvatarLink } from "@/components/management/management-primitives";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RevalidatingBar } from "@/components/ui/revalidating-bar";
import { useApp } from "@/providers/app-provider";
import { questionsApi } from "@/lib/api/questions-client";
import { useQuery, QUERY_POLICY } from "@/lib/client/query-cache";
import { cacheKeys } from "@/lib/client/cache-keys";
import { QUESTION_CATEGORY_OPTIONS } from "@/lib/client/ask-question-core";
import { QUESTION_STATUS_TABS, questionCategoryLabel, questionStatusBadgeVariant, questionStatusLabel } from "@/lib/client/questions-ui";
import type { EmployeeQuestionDTO, QuestionCategoryDTO, QuestionStatusDTO } from "@/lib/api/questions-types";
import { cardIn, staggerStack } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * METRO UP ROUND 1, Milestone 3 — "Вопросы сотрудников". Role-neutral:
 * every bit of scope/visibility behavior comes from GET /api/questions
 * itself (the actor's current context) — this page never branches on
 * "which role is viewing", so it is ready to serve OPERATIONS_DIRECTOR
 * later with no change here (section 2).
 */
export default function QuestionsInboxPage() {
  const router = useRouter();
  const { hydrated, isOnboarded } = useApp();
  const [status, setStatus] = useState<QuestionStatusDTO | "ALL">("ALL");
  const [category, setCategory] = useState<QuestionCategoryDTO | undefined>(undefined);
  const [clubId, setClubId] = useState<string | undefined>(undefined);
  const [page, setPage] = useState(1);

  const filterKey = { status, category, clubId, page };
  const { data, error, isLoading, isValidating, mutate } = useQuery(
    cacheKeys.questionsList(filterKey),
    () => questionsApi.list({ status: status === "ALL" ? undefined : status, category, clubId, page }),
    QUERY_POLICY.MUTABLE,
  );

  // The "Клуб" filter's own options — derived from clubs actually visible in
  // the CURRENT unfiltered page rather than a separate endpoint; good enough
  // for a first pass (a CITY_MANAGER's own scope is rarely more than a
  // handful of clubs) and adds no extra request.
  const clubOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const q of data?.questions ?? []) {
      if (q.clubName) seen.set(q.clubName, q.clubName);
    }
    return Array.from(seen.keys());
  }, [data]);

  function changeStatus(next: QuestionStatusDTO | "ALL") {
    setStatus(next);
    setPage(1);
  }
  function changeCategory(next: string) {
    setCategory(next === "" ? undefined : (next as QuestionCategoryDTO));
    setPage(1);
  }
  function changeClub(next: string) {
    setClubId(next === "" ? undefined : next);
    setPage(1);
  }

  if (!hydrated || !isOnboarded) {
    return <div className="min-h-[100dvh]" />;
  }

  const hasActiveFilter = status !== "ALL" || category !== undefined || clubId !== undefined;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  return (
    <div className="relative min-h-[100dvh] pb-32">
      {/* Round A.1, section A — /questions is always reached as the
          viewer's own root "Вопросы" workspace screen — avatar entry, no
          back button. */}
      <AppHeader title="Вопросы сотрудников" leading={<ManagementAvatarLink />} showThemeSwitcher={false} />
      <RevalidatingBar show={Boolean(data) && isValidating} />

      {/* Management UX Round D, section 8 — a light visual pass only:
          gap-4 -> gap-3 for a slightly tighter vertical rhythm (filters/
          backend/anonymity/status semantics all untouched). */}
      <motion.main variants={staggerStack} initial="hidden" animate="show" className="flex flex-col gap-3 px-5 pt-2">
        {/* Tabs */}
        <motion.div variants={cardIn} className="flex gap-2 overflow-x-auto pb-1">
          {QUESTION_STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => changeStatus(tab.value)}
              className={cn(
                "shrink-0 rounded-full border px-3.5 py-2 text-sm font-medium transition-colors",
                status === tab.value ? "border-brand bg-brand/10 text-foreground" : "border-border bg-card text-muted-foreground",
              )}
            >
              {tab.label}
            </button>
          ))}
        </motion.div>

        {/* Filters */}
        <motion.div variants={cardIn} className="flex gap-2">
          <select
            value={category ?? ""}
            onChange={(e) => changeCategory(e.target.value)}
            className="min-w-0 flex-1 rounded-2xl border border-border bg-card px-3 py-2.5 text-sm text-foreground outline-none focus:border-brand"
          >
            <option value="">Все категории</option>
            {QUESTION_CATEGORY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          {clubOptions.length > 1 && (
            <select
              value={clubId ?? ""}
              onChange={(e) => changeClub(e.target.value)}
              className="min-w-0 flex-1 rounded-2xl border border-border bg-card px-3 py-2.5 text-sm text-foreground outline-none focus:border-brand"
            >
              <option value="">Все клубы</option>
              {clubOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          )}
        </motion.div>

        {isLoading && !data && (
          <div className="flex flex-col gap-2">
            <div className="h-24 animate-pulse rounded-3xl bg-muted" />
            <div className="h-24 animate-pulse rounded-3xl bg-muted" />
            <div className="h-24 animate-pulse rounded-3xl bg-muted" />
          </div>
        )}

        {error && (
          <motion.div variants={cardIn}>
            <GlassCard variant="solid" pad="lg" animateIn={false} className="text-center">
              <p className="font-semibold">Не удалось загрузить вопросы.</p>
              <Button className="mt-4" variant="secondary" onClick={() => mutate()}>
                Повторить
              </Button>
            </GlassCard>
          </motion.div>
        )}

        {data && data.questions.length === 0 && (
          <motion.div variants={cardIn}>
            <GlassCard variant="solid" pad="lg" animateIn={false} className="flex flex-col items-center gap-3 text-center">
              <span className="flex size-11 items-center justify-center rounded-2xl bg-muted">
                <MessageSquareOff className="size-5 text-muted-foreground" />
              </span>
              <p className="text-sm text-muted-foreground">
                {hasActiveFilter ? "По выбранным фильтрам вопросов нет." : "Пока нет вопросов сотрудников."}
              </p>
            </GlassCard>
          </motion.div>
        )}

        {data && data.questions.length > 0 && (
          <motion.div variants={cardIn} className="flex flex-col gap-2">
            {data.questions.map((q) => (
              <QuestionCard key={q.id} question={q} onClick={() => router.push(`/questions/${q.id}`)} />
            ))}
          </motion.div>
        )}

        {data && totalPages > 1 && (
          <motion.div variants={cardIn} className="flex items-center justify-between">
            <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              Назад
            </Button>
            <p className="text-xs text-muted-foreground">
              Стр. {page} из {totalPages}
            </p>
            <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              Далее
            </Button>
          </motion.div>
        )}
      </motion.main>

      {/* Management UX Round A, section 6 — /questions is CITY_MANAGER's
          "Вопросы" root workspace screen. Role-neutral per this page's own
          header comment — the nav just reflects whichever effective
          context the viewing actor is in. */}
      <BottomNavigation />
    </div>
  );
}

/** One row — "Анонимный сотрудник" NEVER renders an avatar (there is no
 * avatar field on EmployeeQuestionDTO to begin with when hidden, and this
 * card never fabricates one from a name either way). */
function QuestionCard({ question, onClick }: { question: EmployeeQuestionDTO; onClick: () => void }) {
  const createdAt = new Date(question.createdAt).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
  return (
    <GlassCard variant="solid" pad="sm" animateIn={false} interactive onClick={onClick} className="flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-xs font-semibold text-muted-foreground">{questionCategoryLabel(question.category)}</p>
          <span className="text-muted-foreground/40">·</span>
          <p className="shrink-0 text-xs text-muted-foreground">{createdAt}</p>
        </div>
        <p className="mt-1 line-clamp-2 text-[15px] font-medium text-foreground">{question.text}</p>
        <p className="mt-1.5 truncate text-xs text-muted-foreground">
          {question.authorDisplay}
          {question.clubName ? ` · ${question.clubName}` : ""}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2">
        <Badge variant={questionStatusBadgeVariant(question.status)}>{questionStatusLabel(question.status)}</Badge>
        <ChevronRight className="size-4 text-muted-foreground/50" />
      </div>
    </GlassCard>
  );
}
