"use client";

import { Building2 } from "lucide-react";
import { fieldCls } from "@/components/admin/ui";

/**
 * Club scope selector (server-backed list) — the caller supplies the exact
 * option set, which MUST already be server-validated:
 * - ADMIN: `scope.clubs` (every active club, ManagerScopeDTO).
 * - Sprint: REMEDIATION R4.2, F-05 — a RoleAssignment-only CLUB_MANAGER with
 *   MULTIPLE active CLUB_MANAGER grants: GET /api/control/club/clubs's own
 *   result (resolveClubManagerClubs — legacy own club UNION active grants),
 *   never the broader ADMIN club list. Selecting a club is re-validated on
 *   the server regardless of which caller renders this (resolveScopedClubId/
 *   getManagerScope never trust a client-supplied id as given).
 *
 * `label` distinguishes the two personas in the UI; the component itself
 * has no RBAC logic of its own either way.
 */
export function ClubScopePicker({
  clubs,
  value,
  onChange,
  label = "Клуб (администратор)",
}: {
  clubs: { id: string; name: string; cityName: string | null }[];
  value: string | null;
  onChange: (clubId: string) => void;
  label?: string;
}) {
  return (
    <label className="flex flex-col">
      <span className="mb-1 flex items-center gap-1 text-xs font-medium text-muted-foreground">
        <Building2 className="size-3.5" /> {label}
      </span>
      <select
        className={`${fieldCls} min-w-[220px]`}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="" disabled>Выберите клуб…</option>
        {clubs.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}{c.cityName ? ` · ${c.cityName}` : ""}
          </option>
        ))}
      </select>
    </label>
  );
}
