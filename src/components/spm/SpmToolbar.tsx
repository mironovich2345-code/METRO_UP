"use client";

import { getCities, getClubsByCityId } from "@/content/cities";
import { fieldCls } from "@/components/admin/ui";
import { lastCompletedMonths, periodKey, periodLabel, type Period } from "@/lib/spm-period";
import type { SpmFilters } from "@/lib/api/spm-client";

/**
 * Unified desktop filter toolbar for SPM pages (Sales / Mystery / Rating).
 * Consistent label style, control height (fieldCls), gaps and baseline
 * (items-end). Controls wrap gracefully on narrow viewports. Filter logic
 * is unchanged.
 */
function Control({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col">
      <span className="mb-1 text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

export function SpmToolbar({
  period,
  onPeriod,
  filters,
  onFilters,
  showFilters = true,
}: {
  period: Period;
  onPeriod: (p: Period) => void;
  filters?: SpmFilters;
  onFilters?: (f: SpmFilters) => void;
  showFilters?: boolean;
}) {
  const months = lastCompletedMonths(12);
  const cities = getCities();
  const clubs = filters?.cityId ? getClubsByCityId(filters.cityId) : [];

  return (
    <div className="flex flex-wrap items-end gap-3">
      <Control label="Период">
        <select
          className={`${fieldCls} w-[170px]`}
          value={periodKey(period)}
          onChange={(e) => {
            const [y, m] = e.target.value.split("-").map(Number);
            onPeriod({ month: m, year: y });
          }}
        >
          {months.map((p) => (
            <option key={periodKey(p)} value={periodKey(p)}>{periodLabel(p)}</option>
          ))}
        </select>
      </Control>

      {showFilters && onFilters && (
        <>
          <Control label="Город">
            <select
              className={`${fieldCls} w-[180px]`}
              value={filters?.cityId ?? ""}
              onChange={(e) => onFilters({ ...filters, cityId: e.target.value || undefined, clubId: undefined })}
            >
              <option value="">Все города</option>
              {cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Control>
          <Control label="Клуб">
            <select
              className={`${fieldCls} w-[180px] disabled:opacity-60`}
              value={filters?.clubId ?? ""}
              disabled={!filters?.cityId}
              onChange={(e) => onFilters({ ...filters, clubId: e.target.value || undefined })}
            >
              <option value="">Все клубы</option>
              {clubs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Control>
          <Control label="Поиск">
            <input
              className={`${fieldCls} w-[220px]`}
              placeholder="Имя сотрудника"
              value={filters?.search ?? ""}
              onChange={(e) => onFilters({ ...filters, search: e.target.value || undefined })}
            />
          </Control>
        </>
      )}
    </div>
  );
}
