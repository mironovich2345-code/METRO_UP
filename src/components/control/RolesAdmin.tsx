"use client";

import { useCallback, useEffect, useReducer, useState } from "react";
import { Plus, RotateCw, ShieldOff, UserCog } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { rolesApi } from "@/lib/api/roles-client";
import { usersAdminApi } from "@/lib/api/knowledge-client";
import type { RoleAssignmentRowDTO, NetworkRoleDTO } from "@/lib/api/roles-types";
import type { AdminUserRowDTO, AdminUserFacetsDTO } from "@/lib/api/knowledge-types";
import { Field, FieldGroup, fieldCls, TextInput, TextArea } from "@/components/admin/ui";
import {
  INITIAL_ROLE_ASSIGNMENT_FORM,
  buildRoleAssignmentRequest,
  describeRoleAssignmentCreateError,
  roleAssignmentFormReducer,
  type AssignableRole,
  type CityManagerScope,
} from "@/lib/control/role-assignment-form";
import { Modal } from "@/components/control/Modal";

/**
 * Sprint 1 / Phase 2B — minimal PROJECT_ADMIN RBAC administration ("не
 * строить полноценный HR-модуль. Только RBAC administration"): list active/
 * inactive RoleAssignment rows, assign OPERATIONS_DIRECTOR/CITY_MANAGER (the
 * only two roles a PROJECT_ADMIN may assign directly — see canAssignRole),
 * revoke/restore. CLUB_MANAGER/MANAGER assignment is CITY_MANAGER's/
 * CLUB_MANAGER's own job (control/city, control/team), not this page's.
 */

const ROLE_LABEL: Record<NetworkRoleDTO, string> = {
  PROJECT_ADMIN: "Технический администратор",
  OPERATIONS_DIRECTOR: "Операционный директор",
  CITY_MANAGER: "Ст. города",
  CLUB_MANAGER: "Управляющий",
  MANAGER: "Менеджер",
};

const STATUS_LABEL: Record<string, string> = {
  PENDING_APPROVAL: "Ожидает",
  ACTIVE: "Активно",
  SUSPENDED: "Отозвано",
  ENDED: "Завершено",
};

function scopeLabel(a: RoleAssignmentRowDTO): string {
  if (a.scopeType === "SYSTEM") return "Система";
  if (a.scopeType === "NETWORK") return "Вся сеть";
  if (a.scopeType === "CITY") return a.cityName ?? a.cityId ?? "—";
  return a.clubName ?? a.clubId ?? "—";
}

export function RolesAdmin() {
  const [rows, setRows] = useState<RoleAssignmentRowDTO[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "denied">("loading");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      setRows((await rolesApi.list()).assignments);
      setStatus("ready");
    } catch (e) {
      setStatus(e instanceof ApiError && (e.status === 403 || e.status === 401) ? "denied" : "error");
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const revoke = async (id: string) => {
    setBusyId(id); setMsg(null);
    try {
      const { assignment } = await rolesApi.revoke(id);
      setRows((rs) => rs.map((r) => (r.id === id ? assignment : r)));
    } catch { setMsg("Не удалось отозвать назначение."); } finally { setBusyId(null); }
  };
  const restore = async (id: string) => {
    setBusyId(id); setMsg(null);
    try {
      const { assignment } = await rolesApi.restore(id);
      setRows((rs) => rs.map((r) => (r.id === id ? assignment : r)));
    } catch { setMsg("Не удалось восстановить назначение."); } finally { setBusyId(null); }
  };

  if (status === "denied") return <p className="text-sm text-muted-foreground">Недостаточно прав.</p>;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Роли</h1>
          <p className="mt-1 text-sm text-muted-foreground">Назначение и отзыв ролей новой RBAC-иерархии. Изменения аудируются.</p>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-2xl bg-brand px-4 py-2.5 text-sm font-semibold text-brand-foreground sm:w-auto"
        >
          <Plus className="size-4" /> Назначить роль
        </button>
      </div>

      {msg && <p className="mt-4 text-sm text-red-500">{msg}</p>}
      {status === "error" && <p className="mt-6 text-sm text-red-500">Не удалось загрузить назначения.</p>}

      {/* QA-05 — phones get a card list (same rows, same actions); the
          720px table stays for md+ instead of scrolling sideways on a phone. */}
      {status === "ready" && (
        <ul className="mt-6 flex flex-col gap-2 md:hidden">
          {rows.map((a) => (
            <li key={a.id} className="rounded-3xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold [overflow-wrap:anywhere]">{a.userDisplayName}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground [overflow-wrap:anywhere]">
                    {ROLE_LABEL[a.role]} · {scopeLabel(a)}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${a.status === "ACTIVE" ? "bg-success-soft text-success" : "bg-muted text-muted-foreground"}`}>
                  {STATUS_LABEL[a.status] ?? a.status}
                </span>
              </div>
              <RowAction a={a} busyId={busyId} onRevoke={revoke} onRestore={restore} className="mt-3 w-full justify-center py-2.5" />
            </li>
          ))}
          {rows.length === 0 && <li className="rounded-3xl border border-border p-6 text-center text-sm text-muted-foreground">Назначений пока нет.</li>}
        </ul>
      )}

      {status === "ready" && (
        <div className="mt-6 hidden overflow-x-auto rounded-3xl border border-border md:block">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Пользователь</th>
                <th className="px-4 py-3">Роль</th>
                <th className="px-4 py-3">Зона</th>
                <th className="px-4 py-3">Статус</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id} className="border-t border-border">
                  <td className="px-4 py-2.5 font-medium">{a.userDisplayName}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{ROLE_LABEL[a.role]}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{scopeLabel(a)}</td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${a.status === "ACTIVE" ? "bg-success-soft text-success" : "bg-muted text-muted-foreground"}`}>
                      {STATUS_LABEL[a.status] ?? a.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <RowAction a={a} busyId={busyId} onRevoke={revoke} onRestore={restore} />
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">Назначений пока нет.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {creating && (
        <CreateAssignmentModal
          onClose={() => setCreating(false)}
          onCreated={(row) => { setRows((rs) => [row, ...rs]); setCreating(false); }}
        />
      )}
    </div>
  );
}

/** Revoke / restore for one assignment row — shared by the card list and the table. */
function RowAction({
  a,
  busyId,
  onRevoke,
  onRestore,
  className = "",
}: {
  a: RoleAssignmentRowDTO;
  busyId: string | null;
  onRevoke: (id: string) => void;
  onRestore: (id: string) => void;
  className?: string;
}) {
  if (a.status === "ACTIVE") {
    return (
      <button
        type="button"
        onClick={() => onRevoke(a.id)}
        disabled={busyId === a.id}
        className={`inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-1.5 text-xs font-semibold text-foreground disabled:opacity-50 ${className}`}
      >
        <ShieldOff className="size-3.5" /> {busyId === a.id ? "…" : "Отозвать"}
      </button>
    );
  }
  if (a.status === "SUSPENDED") {
    return (
      <button
        type="button"
        onClick={() => onRestore(a.id)}
        disabled={busyId === a.id}
        className={`inline-flex items-center gap-1.5 rounded-xl bg-brand px-3 py-1.5 text-xs font-semibold text-brand-foreground disabled:opacity-50 ${className}`}
      >
        <RotateCw className="size-3.5" /> {busyId === a.id ? "…" : "Восстановить"}
      </button>
    );
  }
  return null;
}

/**
 * «Назначить роль». Sprint: LIVE QA QA-05 — ROOT CAUSE of "the selected user
 * resets on mobile": the user picker sat inside `Field`, which is a <label>.
 * Once a user was chosen, the label's first labelable descendant was the
 * «Изменить» button, so ANY tap on that field that did not land on a control
 * — the user's name, the caption, the card padding (exactly where a finger
 * goes to dismiss the keyboard or steady the scroll before picking a role) —
 * was forwarded by the browser to «Изменить» and cleared the selection. The
 * picker is now a FieldGroup (no label semantics), every button is
 * type="button", and the state lives in roleAssignmentFormReducer, where only
 * «Изменить» or a successful assignment can clear the user.
 */
function CreateAssignmentModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (row: RoleAssignmentRowDTO) => void;
}) {
  const [form, dispatch] = useReducer(roleAssignmentFormReducer, INITIAL_ROLE_ASSIGNMENT_FORM);
  // Search results are separate from the selection: a late or repeated
  // response can never replace or clear the chosen user.
  const [matches, setMatches] = useState<AdminUserRowDTO[]>([]);
  const [facets, setFacets] = useState<AdminUserFacetsDTO>({ cities: [], clubs: [] });

  useEffect(() => {
    usersAdminApi.list().then((d) => setFacets(d.facets)).catch(() => {});
  }, []);

  const searching = !form.selectedUser && form.query.trim().length > 0;
  useEffect(() => {
    if (!searching) {
      setMatches([]);
      return;
    }
    const q = form.query.trim();
    let cancelled = false;
    const t = setTimeout(() => {
      usersAdminApi
        .list({ q })
        .then((d) => { if (!cancelled) setMatches(d.users.slice(0, 8)); })
        .catch(() => { if (!cancelled) setMatches([]); });
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [form.query, searching]);

  const submit = async () => {
    if (form.submitting) return;
    const request = buildRoleAssignmentRequest(form);
    if (!request.ok) { dispatch({ type: "VALIDATION_FAILED", error: request.error }); return; }
    dispatch({ type: "SUBMIT_STARTED" });
    try {
      const { assignment } = await rolesApi.create(request.body);
      dispatch({ type: "SUBMIT_SUCCEEDED" });
      onCreated(assignment);
    } catch (e) {
      dispatch({ type: "SUBMIT_FAILED", error: describeRoleAssignmentCreateError(e instanceof ApiError ? e.code : null) });
    }
  };

  const tall = "min-h-11";

  return (
    <Modal onClose={onClose} size="md">
      <h2 className="text-lg font-bold">Назначить роль</h2>
      <p className="mt-1 text-sm text-muted-foreground">PROJECT_ADMIN назначает только Ст. города и Операционного директора.</p>

      <div className="mt-4 space-y-4">
        <FieldGroup label="Пользователь">
          {form.selectedUser ? (
            <div className="flex items-center gap-3 rounded-2xl border-2 border-brand/40 bg-brand/[0.06] px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold [overflow-wrap:anywhere]">{form.selectedUser.displayName}</p>
                {form.selectedUser.clubName && <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">{form.selectedUser.clubName}</p>}
              </div>
              <button
                type="button"
                onClick={() => dispatch({ type: "USER_CLEARED" })}
                disabled={form.submitting}
                className="min-h-11 shrink-0 rounded-xl px-3 text-xs font-semibold text-muted-foreground hover:bg-muted disabled:opacity-50"
              >
                Изменить
              </button>
            </div>
          ) : (
            <>
              <TextInput
                aria-label="Поиск пользователя"
                placeholder="Имя или username…"
                value={form.query}
                onChange={(e) => dispatch({ type: "QUERY_CHANGED", query: e.target.value })}
                className={tall}
              />
              {matches.length > 0 && (
                <div className="mt-1 max-h-60 overflow-y-auto rounded-2xl border border-border bg-card">
                  {matches.map((u) => (
                    <button
                      type="button"
                      key={u.id}
                      onClick={() => dispatch({ type: "USER_SELECTED", user: { id: u.id, displayName: u.displayName, clubName: u.clubName ?? null } })}
                      className="flex min-h-11 w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm hover:bg-muted"
                    >
                      <span className="min-w-0 [overflow-wrap:anywhere]">{u.displayName}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{u.clubName ?? "—"}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </FieldGroup>

        <Field label="Роль">
          <select
            value={form.role}
            onChange={(e) => dispatch({ type: "ROLE_CHANGED", role: e.target.value as AssignableRole })}
            className={`${fieldCls} ${tall}`}
          >
            <option value="CITY_MANAGER">Ст. города</option>
            <option value="OPERATIONS_DIRECTOR">Операционный директор</option>
          </select>
        </Field>

        {form.role === "CITY_MANAGER" && (
          <>
            <Field label="Тип зоны">
              <select
                value={form.scopeType}
                onChange={(e) => dispatch({ type: "SCOPE_TYPE_CHANGED", scopeType: e.target.value as CityManagerScope })}
                className={`${fieldCls} ${tall}`}
              >
                <option value="CITY">Весь город (включая будущие клубы)</option>
                <option value="CLUB">Один клуб (точечно)</option>
              </select>
            </Field>
            {form.scopeType === "CITY" ? (
              <Field label="Город">
                <select value={form.cityId} onChange={(e) => dispatch({ type: "CITY_CHANGED", cityId: e.target.value })} className={`${fieldCls} ${tall}`}>
                  <option value="">Выберите город</option>
                  {facets.cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
            ) : (
              <Field label="Клуб">
                <select value={form.clubId} onChange={(e) => dispatch({ type: "CLUB_CHANGED", clubId: e.target.value })} className={`${fieldCls} ${tall}`}>
                  <option value="">Выберите клуб</option>
                  {facets.clubs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
            )}
          </>
        )}

        <Field label="Комментарий" hint="Необязательно — попадёт в журнал аудита.">
          <TextArea value={form.reason} onChange={(e) => dispatch({ type: "REASON_CHANGED", reason: e.target.value })} />
        </Field>

        {form.error && <p role="alert" className="text-sm text-red-500">{form.error}</p>}

        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className="min-h-11 rounded-2xl border border-border px-4 py-2.5 text-sm font-semibold">
            Отмена
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={form.submitting}
            className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-2xl bg-brand px-4 py-2.5 text-sm font-semibold text-brand-foreground disabled:opacity-50"
          >
            <UserCog className="size-4" /> {form.submitting ? "…" : "Назначить"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
