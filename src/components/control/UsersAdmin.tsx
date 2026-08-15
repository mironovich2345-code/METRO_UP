"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Pencil, ShieldAlert, X } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { usersAdminApi } from "@/lib/api/knowledge-client";
import type { AdminUserRowDTO, AdminUserDetailDTO, AdminUserFacetsDTO } from "@/lib/api/knowledge-types";
import { Field, fieldCls } from "@/components/admin/ui";
import { Modal } from "@/components/control/Modal";

const ROLE_LABEL: Record<string, string> = { EMPLOYEE: "Сотрудник", CLUB_MANAGER: "Управляющий", SPM: "СПМ", ADMIN: "Администратор" };
const POSITION_LABEL: Record<string, string> = { CLIENT_MANAGER: "Менеджер по работе с клиентами", NIGHT_MANAGER: "Ночной менеджер", ADMINISTRATOR: "Администратор клуба" };
const ACCESS_LABEL: Record<string, string> = { LIMITED: "Ограничен", PENDING_APPROVAL: "Ожидает", FULL: "Полный", SUSPENDED: "Заблокирован" };

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

      <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
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

      <div className="mt-4 overflow-x-auto rounded-3xl border border-border">
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
            {status === "ready" && users.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">Сотрудники не найдены</td></tr>}
            {users.map((u) => (
              <tr key={u.id} className="border-t border-border">
                <td className="px-4 py-3 font-medium">{u.displayName}{u.id === currentUserId && <span className="ml-1.5 text-xs text-muted-foreground">(вы)</span>}</td>
                <td className="px-4 py-3 text-muted-foreground">{u.telegramUsername ? `@${u.telegramUsername}` : "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{u.cityName ?? "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{u.clubName ?? "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{u.positionId ? POSITION_LABEL[u.positionId] : "—"}</td>
                <td className="px-4 py-3"><RolePill role={u.role} /></td>
                <td className="px-4 py-3 text-muted-foreground">{u.accessStatus ? ACCESS_LABEL[u.accessStatus] : "—"}</td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => openEdit(u.id)} className="inline-flex items-center gap-1 text-sm font-semibold text-brand hover:underline">
                    <Pencil className="size-3.5" /> Изменить
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
