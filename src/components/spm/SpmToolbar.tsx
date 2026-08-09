"use client";

import { getCities, getClubsByCityId } from "@/content/cities";
import { fieldCls } from "@/components/admin/ui";
import { lastCompletedMonths, periodKey, periodLabel, type Period } from "@/lib/spm-period";
import type { SpmFilters } from "@/lib/api/spm-client";

/** Period selector + optional city/club/search filters for SPM data pages. */
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
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-muted-foreground">Период</span>
        <select
          className={fieldCls + " w-auto"}
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
      </label>

      {showFilters && onFilters && (
        <>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Город</span>
            <select
              className={fieldCls + " w-auto"}
              value={filters?.cityId ?? ""}
              onChange={(e) => onFilters({ ...filters, cityId: e.target.value || undefined, clubId: undefined })}
            >
              <option value="">Все города</option>
              {cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Клуб</span>
            <select
              className={fieldCls + " w-auto"}
              value={filters?.clubId ?? ""}
              disabled={!filters?.cityId}
              onChange={(e) => onFilters({ ...filters, clubId: e.target.value || undefined })}
            >
              <option value="">Все клубы</option>
              {clubs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Поиск</span>
            <input
              className={fieldCls}
              placeholder="Имя сотрудника"
              value={filters?.search ?? ""}
              onChange={(e) => onFilters({ ...filters, search: e.target.value || undefined })}
            />
          </label>
        </>
      )}
    </div>
  );
}
