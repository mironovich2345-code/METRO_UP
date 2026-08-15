"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronDown, Circle, Clock, Pencil, Plus, Power, Trash2, X } from "lucide-react";
import { managerApi } from "@/lib/api/club-plan-client";
import { ApiError } from "@/lib/api/client";
import type { ClubPlanDTO, ClubPlanEmployeeDTO, ClubTaskTarget, ClubTaskTemplateDTO } from "@/lib/api/club-plan-types";
import { Field, TextArea, TextInput, fieldCls } from "@/components/admin/ui";
import { ChecklistEditor, type ChecklistDraftItem } from "@/components/control/ChecklistEditor";
import { ClubScopePicker } from "@/components/control/ClubScopePicker";
import { Modal } from "@/components/control/Modal";

/** ADMIN-selected club scope; null → server uses the actor's own club. Ignored
 * server-side for CLUB_MANAGER (always locked to their own club). */
const ScopeContext = createContext<string | null>(null);
const useScopeClubId = () => useContext(ScopeContext);

const POSITION_LABEL: Record<string, string> = {
  CLIENT_MANAGER: "Менеджеры по работе с клиентами", NIGHT_MANAGER: "Ночные менеджеры", ADMINISTRATOR: "Администраторы",
};

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function ControlPlanPage() {
  const [date, setDate] = useState(todayStr());
  const [clubId, setClubId] = useState<string | null>(null);
  const [plan, setPlan] = useState<ClubPlanDTO | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "denied">("loading");
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      setPlan(await managerApi.plan(date, clubId));
      setStatus("ready");
    } catch (e) {
      setStatus(e instanceof ApiError && (e.status === 403 || e.status === 401) ? "denied" : "error");
    }
  }, [date, clubId]);
  useEffect(() => { void load(); }, [load]);

  const empRatio = plan && plan.totalEmployees ? plan.employeesCompleted / plan.totalEmployees : 0;
  const scope = plan?.scope;

  return (
    <ScopeContext.Provider value={clubId}>
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">План дня</h1>
          <p className="mt-1 text-sm text-muted-foreground">{plan?.clubName ?? (scope?.canSwitch ? "Выберите клуб" : "Ваш клуб")}</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          {scope?.canSwitch && (
            <ClubScopePicker scope={scope} value={clubId ?? scope.clubId} onChange={setClubId} />
          )}
          <label className="flex flex-col">
            <span className="mb-1 text-xs font-medium text-muted-foreground">Дата</span>
            <input type="date" className={`${fieldCls} w-[170px]`} value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <button onClick={() => setShowCreate(true)} disabled={!plan?.clubId} className="flex h-11 items-center gap-1.5 rounded-2xl bg-brand px-5 text-sm font-semibold text-brand-foreground disabled:opacity-50">
            <Plus className="size-4" /> Создать задачу
          </button>
        </div>
      </div>

      {status === "denied" && <p className="mt-6 text-sm text-red-500">Нет доступа к управлению клубом.</p>}
      {status === "error" && <p className="mt-6 text-sm text-red-500">Не удалось загрузить план.</p>}

      {status === "ready" && plan && !plan.clubId && (
        <div className="mt-6 rounded-3xl border border-dashed border-border bg-card/50 p-10 text-center">
          {scope?.canSwitch ? (
            <>
              <p className="font-semibold">Выберите клуб</p>
              <p className="mt-1 text-sm text-muted-foreground">Как администратор выберите клуб выше, чтобы открыть его план дня.</p>
            </>
          ) : (
            <>
              <p className="font-semibold">Учётная запись не привязана к клубу</p>
              <p className="mt-1 text-sm text-muted-foreground">Обратитесь к администратору, чтобы указать клуб в профиле.</p>
            </>
          )}
        </div>
      )}

      {status === "ready" && plan && plan.clubId && (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <SummaryCard label="Сотрудников" value={String(plan.totalEmployees)} />
            <SummaryCard label="Выполнили план" value={`${plan.employeesCompleted}/${plan.totalEmployees}`} ratio={empRatio} />
            <SummaryCard label="Задач выполнено" value={`${plan.tasksCompleted}/${plan.tasksTotal}`} ratio={plan.tasksTotal ? plan.tasksCompleted / plan.tasksTotal : 0} />
          </div>

          <div className="mt-6 space-y-2">
            {plan.employees.map((e) => <EmployeeRow key={e.userId} emp={e} onChanged={load} />)}
            {plan.employees.length === 0 && <p className="text-sm text-muted-foreground">В клубе нет сотрудников.</p>}
          </div>

          <StandardPlan plan={plan} onChanged={load} />
        </>
      )}

      {showCreate && plan && (
        <CreateTaskModal date={date} employees={plan.employees} onClose={() => setShowCreate(false)} onCreated={async () => { setShowCreate(false); await load(); }} />
      )}
    </div>
    </ScopeContext.Provider>
  );
}

function SummaryCard({ label, value, ratio }: { label: string; value: string; ratio?: number }) {
  return (
    <div className="rounded-3xl border border-border bg-card p-5">
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-sm text-muted-foreground">{label}</p>
      {ratio != null && (
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-brand" style={{ width: `${Math.round(ratio * 100)}%` }} />
        </div>
      )}
    </div>
  );
}

function EmployeeRow({ emp, onChanged }: { emp: ClubPlanEmployeeDTO; onChanged: () => Promise<void> }) {
  const scopeClubId = useScopeClubId();
  const [open, setOpen] = useState(false);
  const done = emp.total > 0 && emp.completed === emp.total;
  return (
    <div className="rounded-2xl border border-border bg-card">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
        <span className={`flex size-8 shrink-0 items-center justify-center rounded-xl ${done ? "bg-success text-white" : "bg-muted text-muted-foreground"}`}>
          {done ? <CheckCircle2 className="size-4" /> : <Circle className="size-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{emp.displayName}</p>
          <p className="truncate text-xs text-muted-foreground">{emp.positionTitle ?? "—"}</p>
        </div>
        {emp.hasHighUnfinished && <span className="shrink-0 rounded-full bg-brand/12 px-2 py-0.5 text-[11px] font-bold text-brand">HIGH</span>}
        <span className="shrink-0 text-sm font-semibold text-muted-foreground">{emp.completed}/{emp.total}</span>
        <ChevronDown className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="border-t border-border px-4 py-3">
          {emp.tasks.length === 0 ? (
            <p className="text-xs text-muted-foreground">Задач нет (сотрудник ещё не открыл приложение сегодня).</p>
          ) : (
            <ul className="space-y-2">
              {emp.tasks.map((t) => {
                const cDone = t.checklist.filter((c) => c.done).length;
                return (
                  <li key={t.id} className="flex items-center gap-2 text-sm">
                    {t.status === "COMPLETED" ? <CheckCircle2 className="size-4 shrink-0 text-success" /> : <Circle className="size-4 shrink-0 text-muted-foreground" />}
                    <span className={`min-w-0 flex-1 truncate ${t.status !== "TODO" ? "text-muted-foreground line-through" : ""}`}>{t.title}</span>
                    {t.priority === "HIGH" && <span className="shrink-0 rounded-full bg-brand/12 px-1.5 py-0.5 text-[10px] font-bold text-brand">HIGH</span>}
                    {t.timeHint && <span className="shrink-0 text-[11px] text-muted-foreground">{t.timeHint}</span>}
                    {t.checklist.length > 0 && <span className="shrink-0 text-[11px] font-semibold text-muted-foreground">{cDone}/{t.checklist.length}</span>}
                    {t.canDelete && (
                      <button onClick={async () => { if (confirm("Удалить задачу?")) { await managerApi.deleteTask(t.id, scopeClubId); await onChanged(); } }} className="shrink-0 rounded-lg p-1 text-red-500 hover:bg-red-500/10">
                        <Trash2 className="size-3.5" />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function StandardPlan({ plan, onChanged }: { plan: ClubPlanDTO; onChanged: () => Promise<void> }) {
  const scopeClubId = useScopeClubId();
  const [editing, setEditing] = useState<ClubTaskTemplateDTO | "new" | null>(null);
  return (
    <section className="mt-10 border-t border-border pt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-bold">Стандартный план (ежедневно)</h2>
          <p className="mt-1 text-sm text-muted-foreground">Последовательность задач смены. Материализуется в план сотрудников каждый день.</p>
        </div>
        <button onClick={() => setEditing("new")} className="flex h-10 items-center gap-1.5 rounded-2xl border border-border px-4 text-sm font-semibold hover:bg-muted">
          <Plus className="size-4" /> Задача
        </button>
      </div>

      <div className="mt-4 space-y-2">
        {plan.templates.map((t, i) => (
          <div key={t.id} className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-2.5">
            <span className="w-5 shrink-0 text-sm font-bold text-muted-foreground">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <p className={`flex items-center gap-2 truncate font-medium ${!t.isActive ? "text-muted-foreground line-through" : ""}`}>
                {t.title}
                {t.priority === "HIGH" && <span className="rounded-full bg-brand/12 px-1.5 py-0.5 text-[10px] font-bold text-brand">HIGH</span>}
                {t.timeHint && <span className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground"><Clock className="size-3" />{t.timeHint}</span>}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {t.targetPosition ? POSITION_LABEL[t.targetPosition] : "Все менеджеры"}
                {t.required ? " · обязательная" : ""}
                {t.checklist.length > 0 ? ` · чек-лист ${t.checklist.length}` : ""}
              </p>
            </div>
            <button onClick={() => managerApi.updateTemplate(t.id, { isActive: !t.isActive }, scopeClubId).then(onChanged)} className={`flex h-8 items-center gap-1 rounded-xl px-2.5 text-xs font-semibold ${t.isActive ? "bg-success-soft text-success" : "bg-muted text-muted-foreground"}`}>
              <Power className="size-3.5" /> {t.isActive ? "Активна" : "Выкл"}
            </button>
            <button onClick={() => setEditing(t)} className="rounded-lg p-1.5 hover:bg-muted"><Pencil className="size-4" /></button>
          </div>
        ))}
        {plan.templates.length === 0 && <p className="text-sm text-muted-foreground">Пока нет стандартных задач.</p>}
      </div>

      {plan.systemTasks.length > 0 && (
        <div className="mt-5 rounded-2xl border border-dashed border-border bg-background p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Системные задачи METRO UP (только чтение)</p>
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
            {plan.systemTasks.map((s, i) => <li key={i}>• {s.title}</li>)}
          </ul>
        </div>
      )}

      {editing && (
        <TemplateEditorModal template={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await onChanged(); }} />
      )}
    </section>
  );
}

function TemplateEditorModal({ template, onClose, onSaved }: { template: ClubTaskTemplateDTO | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const scopeClubId = useScopeClubId();
  const [title, setTitle] = useState(template?.title ?? "");
  const [description, setDescription] = useState(template?.description ?? "");
  const [target, setTarget] = useState<string>(template?.targetPosition ?? "");
  const [required, setRequired] = useState(template?.required ?? true);
  const [priority, setPriority] = useState<"NORMAL" | "HIGH">(template?.priority ?? "NORMAL");
  const [timeHint, setTimeHint] = useState(template?.timeHint ?? "");
  const [checklist, setChecklist] = useState<ChecklistDraftItem[]>(template?.checklist.map((c) => ({ id: c.id, text: c.text, required: c.required })) ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (title.trim().length < 2) return;
    setBusy(true);
    setError(null);
    const body = {
      title: title.trim(),
      description: description || null,
      targetPosition: target ? (target as "CLIENT_MANAGER" | "NIGHT_MANAGER") : null,
      required, priority, timeHint: timeHint || null,
      checklist: checklist.filter((c) => c.text.trim()).map((c) => ({ id: c.id, text: c.text.trim(), required: c.required })),
    };
    try {
      if (template) await managerApi.updateTemplate(template.id, body, scopeClubId);
      else await managerApi.createTemplate(body, scopeClubId);
      await onSaved();
    } catch (e) {
      setError(e instanceof ApiError ? "Не удалось сохранить" : "Ошибка");
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose} size="xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">{template ? "Редактировать задачу" : "Новая задача плана"}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-muted"><X className="size-4" /></button>
        </div>
        <div className="mt-4 space-y-3">
          <Field label="Название"><TextInput value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
          <Field label="Описание"><TextArea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Кому">
              <select className={fieldCls} value={target} onChange={(e) => setTarget(e.target.value)}>
                <option value="">Все менеджеры</option>
                <option value="CLIENT_MANAGER">Менеджеры по работе с клиентами</option>
                <option value="NIGHT_MANAGER">Ночные менеджеры</option>
              </select>
            </Field>
            <Field label="Приоритет">
              <select className={fieldCls} value={priority} onChange={(e) => setPriority(e.target.value as "NORMAL" | "HIGH")}>
                <option value="NORMAL">Обычный</option>
                <option value="HIGH">Высокий</option>
              </select>
            </Field>
            <Field label="Подсказка по времени"><TextInput value={timeHint} onChange={(e) => setTimeHint(e.target.value)} placeholder="например: до 14:00" /></Field>
            <label className="flex items-end gap-2 pb-2.5 text-sm">
              <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} /> Обязательная задача
            </label>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">Чек-лист</p>
            <ChecklistEditor items={checklist} onChange={setChecklist} />
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>
        <button onClick={save} disabled={busy || title.trim().length < 2} className="mt-5 w-full rounded-2xl bg-brand px-5 py-2.5 text-sm font-semibold text-brand-foreground disabled:opacity-50">
          {busy ? "Сохраняем…" : "Сохранить"}
        </button>
    </Modal>
  );
}

function CreateTaskModal({ date, employees, onClose, onCreated }: { date: string; employees: ClubPlanEmployeeDTO[]; onClose: () => void; onCreated: () => Promise<void> }) {
  const scopeClubId = useScopeClubId();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [required, setRequired] = useState(false);
  const [priority, setPriority] = useState<"NORMAL" | "HIGH">("NORMAL");
  const [timeHint, setTimeHint] = useState("");
  const [checklist, setChecklist] = useState<ChecklistDraftItem[]>([]);
  const [targetType, setTargetType] = useState<"ALL_MANAGERS" | "CLIENT_MANAGER" | "NIGHT_MANAGER" | "USER">("ALL_MANAGERS");
  const [userId, setUserId] = useState(employees[0]?.userId ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const target: ClubTaskTarget = useMemo(() => {
    if (targetType === "USER") return { type: "USER", userId };
    if (targetType === "ALL_MANAGERS") return { type: "ALL_MANAGERS" };
    return { type: "POSITION", position: targetType as "CLIENT_MANAGER" | "NIGHT_MANAGER" };
  }, [targetType, userId]);

  const create = async () => {
    if (title.trim().length < 2) return;
    setBusy(true);
    setError(null);
    try {
      await managerApi.createTask({
        title: title.trim(), description: description || null, date, required, priority, timeHint: timeHint || null,
        checklist: checklist.filter((c) => c.text.trim()).map((c) => ({ text: c.text.trim(), required: c.required })),
        target,
      }, scopeClubId);
      await onCreated();
    } catch (e) {
      setError(e instanceof ApiError ? "Не удалось создать задачу" : "Ошибка");
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose} size="xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Новая задача</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-muted"><X className="size-4" /></button>
        </div>
        <div className="mt-4 space-y-3">
          <Field label="Название"><TextInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Например: Прозвонить клиентов после рассылки" /></Field>
          <Field label="Описание (необязательно)"><TextArea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Кому">
              <select className={fieldCls} value={targetType} onChange={(e) => setTargetType(e.target.value as typeof targetType)}>
                <option value="ALL_MANAGERS">Всем менеджерам клуба</option>
                <option value="CLIENT_MANAGER">Всем менеджерам по работе с клиентами</option>
                <option value="NIGHT_MANAGER">Всем ночным менеджерам</option>
                <option value="USER">Конкретному сотруднику</option>
              </select>
            </Field>
            <Field label="Приоритет">
              <select className={fieldCls} value={priority} onChange={(e) => setPriority(e.target.value as "NORMAL" | "HIGH")}>
                <option value="NORMAL">Обычный</option>
                <option value="HIGH">Высокий</option>
              </select>
            </Field>
            {targetType === "USER" && (
              <Field label="Сотрудник">
                <select className={fieldCls} value={userId} onChange={(e) => setUserId(e.target.value)}>
                  {employees.map((e) => <option key={e.userId} value={e.userId}>{e.displayName} · {e.positionTitle}</option>)}
                </select>
              </Field>
            )}
            <Field label="Подсказка по времени"><TextInput value={timeHint} onChange={(e) => setTimeHint(e.target.value)} placeholder="например: до 14:00" /></Field>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} /> Обязательная задача
          </label>
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">Чек-лист (необязательно)</p>
            <ChecklistEditor items={checklist} onChange={setChecklist} />
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>
        <button onClick={create} disabled={busy || title.trim().length < 2 || (targetType === "USER" && !userId)} className="mt-5 w-full rounded-2xl bg-brand px-5 py-2.5 text-sm font-semibold text-brand-foreground disabled:opacity-50">
          {busy ? "Создаём…" : "Создать задачу"}
        </button>
    </Modal>
  );
}
