"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Building2,
  CheckCircle2,
  Circle,
  Clock,
  GraduationCap,
  UserCheck,
  Users,
} from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { cabinetApi } from "@/lib/api/cabinet-client";
import { managerApi } from "@/lib/api/club-plan-client";
import { completePlanTask, skipPlanTask, toggleChecklistItem } from "@/lib/api/home-client";
import type { ClubSummaryDTO } from "@/lib/api/roles-client";
import type { CabinetTeamMemberDTO, ClubManagerDashboardDTO } from "@/lib/api/cabinet-client";
import type { DailyPlanDTO, DailyTaskDTO } from "@/lib/api/home-types";
import { filterPendingEmployees, planWidgetState, pluralRu, resolveManagedClubSelection } from "@/lib/cabinet-ui";
import { AccessBadge, CabinetEmptyGood, CabinetErrorState, CabinetSection, CabinetSkeleton, StatCard } from "@/components/control/cabinet-ui";
import { cn } from "@/lib/utils";

/**
 * Sprint: role-cabinets, step 6 — the CLUB_MANAGER ("Управляющий") personal
 * cabinet, at the NEW /control/club route (see that page's own doc comment
 * for why a new route rather than retrofitting /control/team — the two
 * serve different purposes: this is a curated personal dashboard, that
 * remains the existing task-template/sales-input admin tool, untouched).
 *
 * Section 15 — ONE page with sections (Главная summary+attention, Команда,
 * Обучение numbers, План), not four separate routes: at this cabinet's
 * current scope (a single club's own manager, not a multi-page admin
 * surface), one scrollable page with anchored sections is simpler to build
 * and to use on mobile than a four-tab shell, and CityManagerCabinet
 * (step 5) already established this exact "one dashboard page" convention
 * for its own cabinet — consistent with it rather than introducing a
 * second navigation pattern.
 *
 * Section 3 — multi-club handling: tries the dashboard endpoint with NO
 * clubId first (covers an active View-As-CLUB_MANAGER preview, which needs
 * none); on 400 club_required, resolves the caller's own managed clubs
 * (GET /api/control/club/clubs, step 6) and auto-selects only when there is
 * EXACTLY one — never an arbitrary first pick.
 */
export function ClubManagerCabinet() {
  const searchParams = useSearchParams();
  const urlClubId = searchParams.get("clubId");

  const [status, setStatus] = useState<"loading" | "select-club" | "no-club" | "denied" | "error" | "ready">("loading");
  const [candidates, setCandidates] = useState<ClubSummaryDTO[]>([]);
  const [cityName, setCityName] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<ClubManagerDashboardDTO | null>(null);
  const [team, setTeam] = useState<CabinetTeamMemberDTO[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const pendingSectionRef = useRef<HTMLDivElement | null>(null);

  const loadFor = useCallback(async (id: string | undefined, knownCityName: string | null) => {
    setStatus("loading");
    setMsg(null);
    try {
      const [d, t] = await Promise.all([cabinetApi.clubManager(id), cabinetApi.clubManagerTeam(id)]);
      setDashboard(d);
      setTeam(t.members);
      setCityName(knownCityName);
      setStatus("ready");
    } catch (e) {
      if (e instanceof ApiError && e.code === "club_required") {
        try {
          const { clubs } = await cabinetApi.myManagedClubs();
          const selection = resolveManagedClubSelection(clubs);
          if (selection.kind === "none") setStatus("no-club");
          else if (selection.kind === "auto") void loadFor(selection.club.id, selection.club.cityName);
          else {
            setCandidates(selection.clubs);
            setStatus("select-club");
          }
        } catch {
          setStatus("error");
        }
      } else if (e instanceof ApiError && (e.status === 403 || e.status === 401)) {
        setStatus("denied");
      } else {
        setStatus("error");
      }
    }
  }, []);

  useEffect(() => {
    void loadFor(urlClubId ?? undefined, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // resolve once on mount — urlClubId is a one-time entry point, not a live filter

  const reload = useCallback(() => {
    if (dashboard) void loadFor(dashboard.clubId, cityName);
  }, [dashboard, cityName, loadFor]);

  const approve = async (userId: string) => {
    if (!dashboard) return;
    setBusyId(userId);
    setMsg(null);
    try {
      await managerApi.approve(userId, "FULL", dashboard.clubId);
      reload();
    } catch (e) {
      setMsg(
        e instanceof ApiError && e.status === 409
          ? "Заявка уже обработана."
          : e instanceof ApiError && e.status === 403
            ? "Недостаточно прав для подтверждения."
            : "Не удалось подтвердить сотрудника. Проверьте соединение.",
      );
    } finally {
      setBusyId(null);
    }
  };

  const scrollToPending = () => pendingSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  if (status === "denied") return <p className="text-sm text-muted-foreground">Раздел доступен Управляющим клубом.</p>;
  if (status === "no-club") {
    return (
      <div className="rounded-3xl border border-dashed border-border bg-card/50 p-10 text-center">
        <p className="font-semibold">Вы пока не назначены управляющим ни одного клуба</p>
        <p className="mt-1 text-sm text-muted-foreground">Обратитесь к Ст. города, чтобы получить назначение.</p>
      </div>
    );
  }
  if (status === "error") return <CabinetErrorState message="Не удалось загрузить кабинет." onRetry={() => loadFor(urlClubId ?? undefined, cityName)} />;
  if (status === "select-club") {
    return (
      <div>
        <h1 className="text-2xl font-bold">Управляющий</h1>
        <p className="mt-1 text-sm text-muted-foreground">Вы управляете несколькими клубами — выберите, какой открыть.</p>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {candidates.map((c) => (
            <button
              key={c.id}
              onClick={() => void loadFor(c.id, c.cityName)}
              className="flex items-center gap-3 rounded-3xl border border-border bg-card p-4 text-left hover:border-brand"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-brand/12">
                <Building2 className="size-5 text-brand" />
              </span>
              <span>
                <span className="block text-sm font-bold">{c.name}</span>
                <span className="block text-xs text-muted-foreground">{c.cityName ?? "—"}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }
  if (status === "loading" || !dashboard) return <CabinetSkeleton />;

  const pending = team ? filterPendingEmployees(team) : [];

  return (
    <div>
      {/* ---- Header (section 4) ---- */}
      <div>
        <h1 className="text-2xl font-bold">Управляющий</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {dashboard.clubName ?? "Клуб"}
          {cityName ? ` · ${cityName}` : ""}
        </p>
      </div>
      {msg && <p className="mt-2 text-sm text-red-500">{msg}</p>}

      {/* ---- Summary (section 5) ---- */}
      <div className="mt-6 grid grid-cols-2 gap-3">
        <StatCard icon={Users} label="Сотрудников" value={dashboard.summary.employeeCount} />
        <StatCard icon={Clock} label="Ожидают подтверждения" value={dashboard.summary.pendingApprovalCount} emphasize={dashboard.summary.pendingApprovalCount > 0} />
      </div>

      {/* ---- Training (section 5/11) — safe labels only ---- */}
      <div className="mt-4 rounded-3xl border border-border bg-card p-5">
        <p className="inline-flex items-center gap-2 text-sm font-bold">
          <GraduationCap className="size-4 text-brand" /> Прогресс обучения
        </p>
        {dashboard.training ? (
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Проходят обучение</p>
              <p className="mt-0.5 text-lg font-bold tabular-nums">{dashboard.training.employeesInTraining}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Завершили все опубликованные уроки</p>
              <p className="mt-0.5 text-lg font-bold tabular-nums">{dashboard.training.employeesCompleted}</p>
            </div>
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">Нет данных.</p>
        )}
      </div>

      {/* ---- Требует внимания (section 6) — PENDING_EMPLOYEE_APPROVAL only ---- */}
      <div className="mt-6">
        <h2 className="text-lg font-bold">Требует внимания</h2>
        {pending.length === 0 ? (
          <div className="mt-3">
            <CabinetEmptyGood message="Сейчас ничего не требует внимания." />
          </div>
        ) : (
          <button
            onClick={scrollToPending}
            className="mt-3 flex w-full items-center gap-2.5 rounded-2xl border border-border bg-card px-4 py-3 text-left text-sm hover:border-brand"
          >
            <Clock className="size-4 shrink-0 text-brand" />
            {pending.length} {pluralRu(pending.length, "сотрудник", "сотрудника", "сотрудников")}{" "}
            {pluralRu(pending.length, "ожидает", "ожидают", "ожидают")} подтверждения
          </button>
        )}
      </div>

      {/* ---- Новые сотрудники (section 8) ---- */}
      {pending.length > 0 && (
        <div ref={pendingSectionRef} className="mt-8 scroll-mt-4">
          <h2 className="text-lg font-bold">Новые сотрудники</h2>
          <div className="mt-3 space-y-2">
            {pending.map((m) => (
              <div key={m.userId} className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3">
                <div>
                  <p className="text-sm font-semibold">{m.displayName}</p>
                  <p className="text-xs text-muted-foreground">
                    {m.position ?? "—"} · {m.onboardingCompleted ? "Онбординг пройден" : "Онбординг не завершён"}
                  </p>
                </div>
                {!dashboard.isPreviewing && (
                  <button
                    onClick={() => void approve(m.userId)}
                    disabled={busyId === m.userId}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-brand px-3 py-1.5 text-xs font-semibold text-brand-foreground disabled:opacity-50"
                  >
                    <UserCheck className="size-3.5" /> {busyId === m.userId ? "…" : "Подтвердить"}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ---- Команда (section 7) ---- */}
      <CabinetSection title="Команда">
        {!team || team.length === 0 ? (
          <p className="text-sm text-muted-foreground">В клубе пока нет сотрудников.</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-border">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2.5">Сотрудник</th>
                  <th className="px-3 py-2.5">Должность</th>
                  <th className="px-3 py-2.5">Доступ</th>
                  <th className="px-3 py-2.5">Обучение</th>
                  <th className="px-3 py-2.5">Тест</th>
                </tr>
              </thead>
              <tbody>
                {team.map((m) => (
                  <tr key={m.userId} className="border-t border-border">
                    <td className="px-3 py-2 font-medium">{m.displayName}</td>
                    <td className="px-3 py-2 text-muted-foreground">{m.position ?? "—"}</td>
                    <td className="px-3 py-2">
                      <AccessBadge status={m.accessStatus} onboarded={m.onboardingCompleted} />
                    </td>
                    <td className="px-3 py-2 tabular-nums text-muted-foreground">
                      {m.academy.progressPercent != null ? `${m.academy.progressPercent}%` : "Нет данных"}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {m.academy.latestTestResult
                        ? `${m.academy.latestTestResult.scorePercent}% · ${m.academy.latestTestResult.passed ? "сдан" : "не сдан"}`
                        : "Нет данных"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {/* Section 10 — no safe existing employee-detail page a CLUB_MANAGER
            may open exists yet (control/users/[id] is requireSystemAccess()-
            only); documented limitation, roster row only for now. */}
      </CabinetSection>

      {/* ---- Мой клуб (section 14) ---- */}
      <CabinetSection title="Мой клуб">
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-brand/12">
            <Building2 className="size-5 text-brand" />
          </span>
          <div>
            <p className="text-sm font-bold">{dashboard.clubName ?? "—"}</p>
            <p className="text-xs text-muted-foreground">
              {cityName ?? "—"} · {dashboard.summary.employeeCount} {pluralRu(dashboard.summary.employeeCount, "сотрудник", "сотрудника", "сотрудников")}
            </p>
          </div>
        </div>
      </CabinetSection>

      {/* ---- План на сегодня (sections 12-13, 16-17) ---- */}
      <DailyPlanWidget plan={dashboard.plan} readOnly={dashboard.isPreviewing} />
    </div>
  );
}

const CATEGORY_LABEL: Record<string, string> = {
  LEARNING: "Обучение",
  SALES: "Продажи",
};

/**
 * Sections 12-13 — the manager's OWN Daily Plan, via the SAME mutation
 * endpoints the Mini-App uses (completePlanTask/skipPlanTask/
 * toggleChecklistItem from home-client.ts, unmodified) — never a
 * reimplementation. Deliberately NOT the Mini-App's own visual components
 * (TaskCard/GlassCard/AppHeader): those are styled for the Telegram Mini
 * App's own design language, which would look out of place inside this
 * desktop /control portal — this widget matches the SAME flat-card/table
 * visual language as the rest of this cabinet instead, calling the exact
 * same server endpoints for its interactions. Read-only whenever a preview
 * is active (isPreviewing/readOnly) — real-actor mutation rights are still
 * decided server-side (requireFullAccess + the global View-As middleware);
 * this only hides controls that would 403 anyway.
 */
function DailyPlanWidget({ plan, readOnly }: { plan: DailyPlanDTO | null; readOnly: boolean }) {
  const [tasks, setTasks] = useState<DailyTaskDTO[] | null>(plan?.tasks ?? null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => setTasks(plan?.tasks ?? null), [plan]);

  const patch = (task: DailyTaskDTO) => setTasks((ts) => (ts ? ts.map((t) => (t.id === task.id ? task : t)) : ts));

  const complete = async (id: string) => {
    setBusyId(id);
    try {
      const { task } = await completePlanTask(id);
      patch(task);
    } catch {
      /* the existing per-task 403/409 cases have no dedicated cabinet copy yet — silently ignored, matches Mini-App's own tolerance here */
    } finally {
      setBusyId(null);
    }
  };
  const skip = async (id: string) => {
    setBusyId(id);
    try {
      const { task } = await skipPlanTask(id);
      patch(task);
    } finally {
      setBusyId(null);
    }
  };
  const toggleItem = async (taskId: string, itemId: string, done: boolean) => {
    setBusyId(taskId);
    try {
      const { task } = await toggleChecklistItem(taskId, itemId, done);
      patch(task);
    } finally {
      setBusyId(null);
    }
  };

  const widgetState = planWidgetState(plan);

  return (
    <CabinetSection title="План на сегодня">
      {widgetState === "no-data" || !plan || !tasks ? (
        <p className="text-sm text-muted-foreground">Нет данных о плане.</p>
      ) : widgetState === "empty" ? (
        <p className="text-sm text-muted-foreground">На сегодня задач нет.</p>
      ) : (
        <>
          <p className="mb-3 text-xs text-muted-foreground tabular-nums">
            {plan.completed} из {plan.total} выполнено
          </p>
          <div className="space-y-2">
            {tasks.map((task) => (
              <div key={task.id} className="rounded-2xl border border-border px-3 py-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className={cn("truncate text-sm font-semibold", task.status === "COMPLETED" && "text-muted-foreground line-through")}>
                      {task.title}
                    </p>
                    {task.description && <p className="mt-0.5 truncate text-xs text-muted-foreground">{task.description}</p>}
                    <p className="mt-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                      {CATEGORY_LABEL[task.category] ?? task.category}
                    </p>
                  </div>
                  {!readOnly && task.mode === "manual" && task.checklist.length === 0 && task.status === "TODO" && (
                    <button
                      onClick={() => void complete(task.id)}
                      disabled={busyId === task.id}
                      className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-brand px-2.5 py-1 text-xs font-semibold text-brand-foreground disabled:opacity-50"
                    >
                      <CheckCircle2 className="size-3.5" /> {busyId === task.id ? "…" : "Готово"}
                    </button>
                  )}
                  {task.status === "COMPLETED" && <CheckCircle2 className="size-4 shrink-0 text-success" />}
                  {task.status === "SKIPPED" && <Circle className="size-4 shrink-0 text-muted-foreground" />}
                </div>

                {task.checklist.length > 0 && (
                  <div className="mt-2 space-y-1 border-t border-border pt-2">
                    {task.checklist.map((item) => (
                      <label key={item.id} className="flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={item.done}
                          disabled={readOnly || busyId === task.id}
                          onChange={(e) => void toggleItem(task.id, item.id, e.target.checked)}
                          className="size-3.5 rounded border-border"
                        />
                        <span className={cn(item.done && "text-muted-foreground line-through")}>{item.text}</span>
                      </label>
                    ))}
                  </div>
                )}

                {!readOnly && task.mode === "manual" && task.status === "TODO" && (
                  <button onClick={() => void skip(task.id)} disabled={busyId === task.id} className="mt-2 text-[11px] font-semibold text-muted-foreground underline">
                    Пропустить
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </CabinetSection>
  );
}
