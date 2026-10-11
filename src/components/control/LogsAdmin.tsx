"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@/lib/api/client";
import { controlAdminApi, type AdminAuditLogRow } from "@/lib/api/control-admin-client";
import { AUDIT_ACTION_LABEL, describeAuditAction, describeAuditContext, formatLogTime } from "@/lib/control/admin-dashboard";
import { fieldCls } from "@/components/admin/ui";

const PAGE_SIZE = 50;

/**
 * Sprint: LIVE QA QA-06 — «Логи»: the existing UserAuditLog (access, roles,
 * View As, profile, onboarding and task events), newest first, with an
 * action filter and «Показать ещё». Cards on phones, a table from md.
 */
export function LogsAdmin() {
  const [action, setAction] = useState("");
  const [rows, setRows] = useState<AdminAuditLogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "denied">("loading");

  const load = useCallback(async (nextPage: number, append: boolean) => {
    setStatus("loading");
    try {
      const res = await controlAdminApi.logs({ action: action || undefined, page: nextPage, limit: PAGE_SIZE });
      setRows((prev) => (append ? [...prev, ...res.rows] : res.rows));
      setTotal(res.total);
      setPage(nextPage);
      setStatus("ready");
    } catch (e) {
      setStatus(e instanceof ApiError && (e.status === 401 || e.status === 403) ? "denied" : "error");
    }
  }, [action]);

  useEffect(() => {
    void load(1, false);
  }, [load]);

  const now = new Date();
  if (status === "denied") return <p className="text-sm text-muted-foreground">Недостаточно прав.</p>;

  return (
    <div>
      <h1 className="text-2xl font-bold">Логи</h1>
      <p className="mt-1 text-sm text-muted-foreground">Журнал действий: доступ, роли, режим просмотра, профиль.</p>

      <div className="mt-5 max-w-sm">
        <select aria-label="Действие" value={action} onChange={(e) => setAction(e.target.value)} className={`${fieldCls} min-h-11`}>
          <option value="">Все действия</option>
          {Object.entries(AUDIT_ACTION_LABEL).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

      {status === "error" && <p className="mt-4 text-sm text-red-500">Не удалось загрузить логи.</p>}
      {status === "ready" && rows.length === 0 && <p className="mt-6 text-sm text-muted-foreground">Событий нет.</p>}

      <ul className="mt-4 flex flex-col gap-2 md:hidden">
        {rows.map((r) => {
          const context = describeAuditContext(r);
          return (
            <li key={r.id} className="rounded-3xl border border-border bg-card p-4">
              <p className="font-semibold [overflow-wrap:anywhere]">{describeAuditAction(r.action)}</p>
              <p className="mt-0.5 text-sm text-muted-foreground [overflow-wrap:anywhere]">
                {r.actorName ?? "—"}
                {context ? ` → ${context}` : ""}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">{formatLogTime(r.createdAt, now)}</p>
            </li>
          );
        })}
      </ul>

      {rows.length > 0 && (
        <div className="mt-4 hidden overflow-x-auto rounded-3xl border border-border md:block">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Время</th>
                <th className="px-4 py-3 font-medium">Кто</th>
                <th className="px-4 py-3 font-medium">Действие</th>
                <th className="px-4 py-3 font-medium">Кому / где</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="whitespace-nowrap px-4 py-2.5 text-muted-foreground" title={new Date(r.createdAt).toLocaleString("ru-RU")}>
                    {formatLogTime(r.createdAt, now)}
                  </td>
                  <td className="px-4 py-2.5 font-medium">{r.actorName ?? "—"}</td>
                  <td className="px-4 py-2.5">{describeAuditAction(r.action)}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{describeAuditContext(r) || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {rows.length < total && (
        <button
          type="button"
          onClick={() => void load(page + 1, true)}
          disabled={status === "loading"}
          className="mt-4 min-h-11 w-full rounded-2xl border border-border px-4 text-sm font-semibold disabled:opacity-50 sm:w-auto"
        >
          {status === "loading" ? "…" : "Показать ещё"}
        </button>
      )}
    </div>
  );
}
