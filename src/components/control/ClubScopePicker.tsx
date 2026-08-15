"use client";

import { Building2 } from "lucide-react";
import { fieldCls } from "@/components/admin/ui";
import type { ManagerScopeDTO } from "@/lib/api/club-plan-types";

/**
 * ADMIN-only club scope selector (server-backed list). Rendered only when
 * `scope.canSwitch` is true — CLUB_MANAGER never sees it and is locked to their
 * own club server-side. Selecting a club is validated on the server.
 */
export function ClubScopePicker({
  scope,
  value,
  onChange,
}: {
  scope: ManagerScopeDTO;
  value: string | null;
  onChange: (clubId: string) => void;
}) {
  return (
    <label className="flex flex-col">
      <span className="mb-1 flex items-center gap-1 text-xs font-medium text-muted-foreground">
        <Building2 className="size-3.5" /> Клуб (администратор)
      </span>
      <select
        className={`${fieldCls} min-w-[220px]`}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="" disabled>Выберите клуб…</option>
        {scope.clubs.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}{c.cityName ? ` · ${c.cityName}` : ""}
          </option>
        ))}
      </select>
    </label>
  );
}
