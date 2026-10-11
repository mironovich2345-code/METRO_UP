"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Pencil, ShieldAlert, X } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { usersAdminApi } from "@/lib/api/knowledge-client";
import type { AdminUserRowDTO, AdminUserDetailDTO, AdminUserFacetsDTO } from "@/lib/api/knowledge-types";
import { Field, fieldCls } from "@/components/admin/ui";
import { Modal } from "@/components/control/Modal";
import { USER_ACCESS_LABEL, USER_POSITION_LABEL, USER_ROLE_LABEL, describeAdminUserRow } from "@/lib/control/users-view";

const ROLE_LABEL = USER_ROLE_LABEL;
const POSITION_LABEL = USER_POSITION_LABEL;
const ACCESS_LABEL = USER_ACCESS_LABEL;

export function UsersAdmin({ currentUserId }: { currentUserId: string }) {
  const [users, setUsers] = useState<AdminUserRowDTO[]>([]);
  const [facets, setFacets] = useState<AdminUserFacetsDTO>({ cities: [], clubs: [] });
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "denied">("loading");
  const [filter, setFilter] = useState({ cityId: "", clubId: "", role: "", positionId: "", q: "" });
  const [editing, setEditing] = useState<AdminUserDetailDTO | null>(null);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const data = await usersAdminApi.list({
        cityId: filter.cityId || undefined,
        clubId: filter.clubId || undefined,
        role: filter.role || undefined,
        positionId: filter.positionId || undefined,
        q: filter.q || undefined,
      });
      setUsers(data.users);
      setFacets(data.facets);
      setStatus("ready");
    } catch (e) {
      setStatus(e instanceof ApiError && (e.status === 403 || e.status === 401) ? "denied" : "error");
    }
  }, [filter]);
  useEffect(() => { void load(); }, [load]);

  const clubsForFilter = useMemo(
    () => (filter.cityId ? facets.clubs.filter((c) => c.cityId === filter.cityId) : facets.clubs),
    [facets.clubs, filter.cityId],
  );

  const openEdit = async (id: string) => {
    try { setEditing((await usersAdminApi.get(id)).user); } catch { /* ignore */ }
  };

  if (status === "denied") return <p className="text-sm text-muted-foreground">Недостаточно прав.</p>;

  return (
    <div>
      <h1 className="text-2xl font-bold">Сотрудники</h1>
      <p className="mt-1 text-sm text-muted-foreground">Роли, должности и клубы. Изменения фиксируются в журнале.</p>

      {/* Filters unchanged; QA-05.2 — 44px controls on phones, no overflow. */}
      <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5 [&>*]:min-h-11 [&>*]:min-w-0">
        <select value={filter.cityId} onChange={(e) => setFilter((f) => ({ ...f, cityId: e.target.value, clubId: "" }))} className={fieldCls}>
          <option value="">Все города</option>
          {facets.cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={filter.clubId} onChange={(e) => setFilter((f) => ({ ...f, clubId: e.target.value }))} className={fieldCls}>
          <option value="">Все клубы</option>
          {clubsForFilter.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={filter.role} onChange={(e) => setFilter((f) => ({ ...f, role: e.target.value }))} className={fieldCls}>
          <option value="">Любая роль</option>
          {Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={filter.positionId} onChange={(e) => setFilter((f) => ({ ...f, positionId: e.target.value }))} className={fieldCls}>
          <option value="">Любая должность</option>
          {Object.entries(POSITION_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input value={filter.q} onChange={(e) => setFilter((f) => ({ ...f, q: e.target.value }))} placeholder="Поиск по имени / @username" className={fieldCls} />
      </div>

      <UsersResults users={users} status={status} currentUserId={currentUserId} onEdit={openEdit} />

      {editing && (
        <UserEditor
          initial={editing}
          facets={facets}
          isSelf={editing.id === currentUserId}
          onClose={() => setEditing(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}

/**
 * QA-05.2 — the results, from ONE list (the same `users` state the filters
 * load): cards below `md` (phones), the original 8-column table from `md`.
 * Both render describeAdminUserRow() and the same «Изменить» action, so no
 * field or action exists in one layout only.
 */
export function UsersResults({
  users,
  status,
  currentUserId,
  onEdit,
}: {
  users: AdminUserRowDTO[];
  status: "loading" | "ready" | "error" | "denied";
  currentUserId: string;
  onEdit: (id: string) => void;
}) {
  const rows = users.map((u) => describeAdminUserRow(u, currentUserId));
  const empty = status === "ready" && rows.length === 0;
  return (
    <>
      <ul className="mt-4 flex flex-col gap-2 md:hidden" aria-label="Сотрудники">
        {status === "loading" && <li className="rounded-3xl border border-border p-6 text-center text-sm text-muted-foreground">Загрузка…</li>}
        {empty && <li className="rounded-3xl border border-border p-6 text-center text-sm text-muted-foreground">Сотрудники не найдены</li>}
        {rows.map((r) => (
          <li key={r.id} data-user-card={r.id} className="rounded-3xl border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold [overflow-wrap:anywhere]">
                  {r.name}
                  {r.isSelf && <span className="ml-1.5 whitespace-nowrap text-xs font-normal text-muted-foreground">(вы)</span>}
                </p>
                <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">{r.telegram}</p>
              </div>
              <RolePill role={r.role} />
            </div>
            <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
              <dt className="text-muted-foreground">Город</dt>
              <dd className="[overflow-wrap:anywhere]">{r.city}</dd>
              <dt className="text-muted-foreground">Клуб</dt>
              <dd className="[overflow-wrap:anywhere]">{r.club}</dd>
              <dt className="text-muted-foreground">Должность</dt>
              <dd className="[overflow-wrap:anywhere]">{r.position}</dd>
              <dt className="text-muted-foreground">Статус</dt>
              <dd>{r.access}</dd>
            </dl>
            <button
              type="button"
              onClick={() => onEdit(r.id)}
              className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-2xl border border-border text-sm font-semibold text-brand hover:bg-muted"
            >
              <Pencil className="size-3.5" aria-hidden /> Изменить
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-4 hidden overflow-x-auto rounded-3xl border border-border md:block">
        <table className="w-full min-w-[880px] text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Сотрудник</th>
              <th className="px-4 py-3 font-medium">Telegram</th>
              <th className="px-4 py-3 font-medium">Город</th>
              <th className="px-4 py-3 font-medium">Клуб</th>
              <th className="px-4 py-3 font-medium">Должность</th>
              <th className="px-4 py-3 font-medium">Роль</th>
              <th className="px-4 py-3 font-medium">Статус</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {status === "loading" && <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">Загрузка…</td></tr>}
            {empty && <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">Сотрудники не найдены</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} data-user-row={r.id} className="border-t border-border">
                <td className="px-4 py-3 font-medium">{r.name}{r.isSelf && <span className="ml-1.5 text-xs text-muted-foreground">(вы)</span>}</td>
                <td className="px-4 py-3 text-muted-foreground">{r.telegram}</td>
                <td className="px-4 py-3 text-muted-foreground">{r.city}</td>
                <td className="px-4 py-3 text-muted-foreground">{r.club}</td>
                <td className="px-4 py-3 text-muted-foreground">{r.position}</td>
                <td className="px-4 py-3"><RolePill role={r.role} /></td>
                <td className="px-4 py-3 text-muted-foreground">{r.access}</td>
                <td className="px-4 py-3 text-right">
                  <button type="button" onClick={() => onEdit(r.id)} className="inline-flex items-center gap-1 text-sm font-semibold text-brand hover:underline">
                    <Pencil className="size-3.5" /> Изменить
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function RolePill({ role }: { role: string }) {
  const cls: Record<string, string> = {
    ADMIN: "bg-brand/15 text-brand", SPM: "bg-brand/10 text-foreground",
    CLUB_MANAGER: "bg-success-soft text-success", EMPLOYEE: "bg-muted text-muted-foreground",
  };
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${cls[role] ?? "bg-muted"}`}>{ROLE_LABEL[role] ?? role}</span>;
}

/* -------------------------------- editor --------------------------------- */

function UserEditor({
  initial, facets, isSelf, onClose, onSaved,
}: {
  initial: AdminUserDetailDTO;
  facets: AdminUserFacetsDTO;
  isSelf: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [role, setRole] = useState(initial.role);
  const [positionId, setPositionId] = useState(initial.positionId ?? "");
  const [cityId, setCityId] = useState(initial.cityId ?? "");
  const [clubId, setClubId] = useState(initial.clubId ?? "");
  const [accessStatus, setAccessStatus] = useState(initial.accessStatus ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const hasProfile = initial.hasProfile;

  const clubsForCity = useMemo(
    () => (cityId ? facets.clubs.filter((c) => c.cityId === cityId) : facets.clubs),
    [facets.clubs, cityId],
  );

  // Lockout guard mirrored on the client (server is authoritative).
  const selfDemotion = isSelf && initial.role === "ADMIN" && role !== "ADMIN";

  const save = async () => {
    if (selfDemotion) { setErr("Нельзя снять роль администратора с самого себя"); return; }
    setBusy(true); setErr(null);
    try {
      const body: Record<string, unknown> = {};
      if (role !== initial.role) body.role = role;
      if (hasProfile) {
        if (positionId && positionId !== initial.positionId) body.positionId = positionId;
        if (cityId && cityId !== initial.cityId) body.cityId = cityId;
        if (clubId && clubId !== initial.clubId) body.clubId = clubId;
        if (accessStatus && accessStatus !== initial.accessStatus) body.accessStatus = accessStatus;
      }
      if (Object.keys(body).length === 0) { onClose(); return; }
      await usersAdminApi.update(initial.id, body);
      onSaved();
      onClose();
    } catch (e) {
      setErr(e instanceof ApiError ? errText(e) : "Ошибка сохранения");
    } finally { setBusy(false); }
  };

  return (
    <Modal onClose={onClose} size="lg">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">{initial.displayName}</h2>
          <button onClick={onClose} className="rounded-xl p-2 hover:bg-muted"><X className="size-5" /></button>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {initial.telegramUsername ? `@${initial.telegramUsername}` : "Без username"} · создан {new Date(initial.createdAt).toLocaleDateString("ru-RU")}
        </p>

        {err && <p className="mt-3 flex items-center gap-1.5 rounded-2xl bg-red-500/10 px-4 py-2.5 text-xs text-red-500"><ShieldAlert className="size-4" />{err}</p>}
        {!hasProfile && <p className="mt-3 rounded-2xl bg-muted px-4 py-2.5 text-xs text-muted-foreground">У сотрудника ещё нет профиля (не прошёл онбординг). Доступно только изменение роли.</p>}

        <div className="mt-4 space-y-4">
          <Field label="Роль" hint={role === "CLUB_MANAGER" ? "Управляющему нужен назначенный клуб." : undefined}>
            <select value={role} onChange={(e) => setRole(e.target.value as typeof role)} className={fieldCls}>
              {Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          {selfDemotion && <p className="text-xs text-red-500">Нельзя снять с себя роль администратора — защита от блокировки доступа.</p>}

          {hasProfile && (
            <>
              <Field label="Должность">
                <select value={positionId} onChange={(e) => setPositionId(e.target.value)} className={fieldCls}>
                  {Object.entries(POSITION_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Field>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Город">
                  <select value={cityId} onChange={(e) => { setCityId(e.target.value); setClubId(""); }} className={fieldCls}>
                    {facets.cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </Field>
                <Field label="Клуб">
                  <select value={clubId} onChange={(e) => setClubId(e.target.value)} className={fieldCls}>
                    <option value="">— выберите —</option>
                    {clubsForCity.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="Статус доступа">
                <select value={accessStatus} onChange={(e) => setAccessStatus(e.target.value)} className={fieldCls}>
                  {Object.entries(ACCESS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Field>
            </>
          )}
        </div>

        <div className="mt-6 flex items-center justify-end gap-2 border-t border-border pt-4">
          <button onClick={onClose} className="rounded-2xl border border-border px-4 py-2.5 text-sm font-semibold hover:bg-muted">Отмена</button>
          <button onClick={save} disabled={busy || selfDemotion} className="rounded-2xl bg-brand px-4 py-2.5 text-sm font-semibold text-brand-foreground disabled:opacity-50">Сохранить</button>
        </div>
    </Modal>
  );
}

function errText(e: ApiError): string {
  const map: Record<string, string> = {
    self_demotion_forbidden: "Нельзя снять роль администратора с самого себя",
    last_admin: "Нельзя убрать последнего администратора в системе",
    club_required_for_manager: "Назначьте клуб перед ролью управляющего",
    profile_required: "У сотрудника ещё нет профиля",
    club_not_found: "Клуб не найден",
    club_city_mismatch: "Клуб не относится к выбранному городу",
    club_required: "Смена города требует выбора клуба этого города",
    validation_error: "Проверьте заполнение полей",
  };
  return map[e.code] ?? "Ошибка запроса";
}
