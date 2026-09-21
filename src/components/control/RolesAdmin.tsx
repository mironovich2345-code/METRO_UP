"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, RotateCw, ShieldOff, UserCog } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { rolesApi } from "@/lib/api/roles-client";
import { usersAdminApi } from "@/lib/api/knowledge-client";
import type { RoleAssignmentRowDTO, NetworkRoleDTO } from "@/lib/api/roles-types";
import type { AdminUserRowDTO, AdminUserFacetsDTO } from "@/lib/api/knowledge-types";
import { Field, fieldCls, TextInput, TextArea } from "@/components/admin/ui";
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
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-1.5 rounded-2xl bg-brand px-4 py-2.5 text-sm font-semibold text-brand-foreground"
        >
          <Plus className="size-4" /> Назначить роль
        </button>
      </div>

      {msg && <p className="mt-4 text-sm text-red-500">{msg}</p>}
      {status === "error" && <p className="mt-6 text-sm text-red-500">Не удалось загрузить назначения.</p>}

      {status === "ready" && (
        <div className="mt-6 overflow-x-auto rounded-3xl border border-border">
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
                    {a.status === "ACTIVE" ? (
                      <button
                        onClick={() => revoke(a.id)}
                        disabled={busyId === a.id}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-1.5 text-xs font-semibold text-foreground disabled:opacity-50"
                      >
                        <ShieldOff className="size-3.5" /> {busyId === a.id ? "…" : "Отозвать"}
                      </button>
                    ) : a.status === "SUSPENDED" ? (
                      <button
                        onClick={() => restore(a.id)}
                        disabled={busyId === a.id}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-3 py-1.5 text-xs font-semibold text-brand-foreground disabled:opacity-50"
                      >
                        <RotateCw className="size-3.5" /> {busyId === a.id ? "…" : "Восстановить"}
                      </button>
                    ) : null}
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

function CreateAssignmentModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (row: RoleAssignmentRowDTO) => void;
}) {
  const [q, setQ] = useState("");
  const [matches, setMatches] = useState<AdminUserRowDTO[]>([]);
  const [selected, setSelected] = useState<AdminUserRowDTO | null>(null);
  const [role, setRole] = useState<Extract<NetworkRoleDTO, "CITY_MANAGER" | "OPERATIONS_DIRECTOR">>("CITY_MANAGER");
  const [scopeType, setScopeType] = useState<"CITY" | "CLUB">("CITY");
  const [cityId, setCityId] = useState("");
  const [clubId, setClubId] = useState("");
  const [reason, setReason] = useState("");
  const [facets, setFacets] = useState<AdminUserFacetsDTO>({ cities: [], clubs: [] });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    usersAdminApi.list().then((d) => setFacets(d.facets)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!q.trim()) { setMatches([]); return; }
    const t = setTimeout(() => {
      usersAdminApi.list({ q: q.trim() }).then((d) => setMatches(d.users.slice(0, 8))).catch(() => setMatches([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const submit = async () => {
    if (!selected) { setErr("Выберите пользователя."); return; }
    setBusy(true); setErr(null);
    try {
      const body =
        role === "OPERATIONS_DIRECTOR"
          ? { userId: selected.id, role, scopeType: "NETWORK" as const, reason: reason || undefined }
          : scopeType === "CITY"
            ? { userId: selected.id, role, scopeType: "CITY" as const, cityId, reason: reason || undefined }
            : { userId: selected.id, role, scopeType: "CLUB" as const, clubId, reason: reason || undefined };
      const { assignment } = await rolesApi.create(body);
      onCreated(assignment);
    } catch (e) {
      setErr(e instanceof ApiError ? (e.code === "assignment_already_active" ? "Такое назначение уже активно." : "Не удалось создать назначение.") : "Ошибка.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose} size="md">
      <div className="p-6">
        <h2 className="text-lg font-bold">Назначить роль</h2>
        <p className="mt-1 text-sm text-muted-foreground">PROJECT_ADMIN назначает только Ст. города и Операционного директора.</p>

        <div className="mt-4 space-y-4">
          <Field label="Пользователь">
            {selected ? (
              <div className="flex items-center justify-between rounded-2xl border border-border bg-background px-4 py-2.5 text-sm">
                <span>{selected.displayName}</span>
                <button onClick={() => setSelected(null)} className="text-xs font-semibold text-muted-foreground">Изменить</button>
              </div>
            ) : (
              <>
                <TextInput placeholder="Имя или username…" value={q} onChange={(e) => setQ(e.target.value)} />
                {matches.length > 0 && (
                  <div className="mt-1 max-h-48 overflow-y-auto rounded-2xl border border-border bg-card">
                    {matches.map((u) => (
                      <button
                        key={u.id}
                        onClick={() => { setSelected(u); setMatches([]); setQ(""); }}
                        className="flex w-full items-center justify-between px-4 py-2 text-left text-sm hover:bg-muted"
                      >
                        <span>{u.displayName}</span>
                        <span className="text-xs text-muted-foreground">{u.clubName ?? "—"}</span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </Field>

          <Field label="Роль">
            <select value={role} onChange={(e) => setRole(e.target.value as typeof role)} className={fieldCls}>
              <option value="CITY_MANAGER">Ст. города</option>
              <option value="OPERATIONS_DIRECTOR">Операционный директор</option>
            </select>
          </Field>

          {role === "CITY_MANAGER" && (
            <>
              <Field label="Тип зоны">
                <select value={scopeType} onChange={(e) => setScopeType(e.target.value as typeof scopeType)} className={fieldCls}>
                  <option value="CITY">Весь город (включая будущие клубы)</option>
                  <option value="CLUB">Один клуб (точечно)</option>
                </select>
              </Field>
              {scopeType === "CITY" ? (
                <Field label="Город">
                  <select value={cityId} onChange={(e) => setCityId(e.target.value)} className={fieldCls}>
                    <option value="">Выберите город</option>
                    {facets.cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </Field>
              ) : (
                <Field label="Клуб">
                  <select value={clubId} onChange={(e) => setClubId(e.target.value)} className={fieldCls}>
                    <option value="">Выберите клуб</option>
                    {facets.clubs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </Field>
              )}
            </>
          )}

          <Field label="Комментарий" hint="Необязательно — попадёт в журнал аудита.">
            <TextArea value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>

          {err && <p className="text-sm text-red-500">{err}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button onClick={onClose} className="rounded-2xl border border-border px-4 py-2.5 text-sm font-semibold">Отмена</button>
            <button
              onClick={submit}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-2xl bg-brand px-4 py-2.5 text-sm font-semibold text-brand-foreground disabled:opacity-50"
            >
              <UserCog className="size-4" /> {busy ? "…" : "Назначить"}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
