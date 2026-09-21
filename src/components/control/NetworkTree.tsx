"use client";

import { useEffect, useState } from "react";
import { Building2, MapPin, Users } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { networkApi, type NetworkCitySummaryDTO } from "@/lib/api/roles-client";

/**
 * Sprint 1 / Phase 2B, section 20 — minimal OPERATIONS_DIRECTOR read path:
 * cities -> clubs -> employee count. Deliberately no ranking/feedback/
 * documents/AI here ("Главное — доказать NETWORK scope").
 */
export function NetworkTree() {
  const [cities, setCities] = useState<NetworkCitySummaryDTO[] | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "denied">("loading");

  useEffect(() => {
    networkApi.tree()
      .then((d) => { setCities(d.cities); setStatus("ready"); })
      .catch((e) => setStatus(e instanceof ApiError && (e.status === 403 || e.status === 401) ? "denied" : "error"));
  }, []);

  if (status === "denied") return <p className="text-sm text-muted-foreground">Недостаточно прав.</p>;
  if (status === "error") return <p className="text-sm text-red-500">Не удалось загрузить сеть.</p>;

  const totalClubs = cities?.reduce((n, c) => n + c.clubs.length, 0) ?? 0;
  const totalEmployees = cities?.reduce((n, c) => n + c.clubs.reduce((m, cl) => m + cl.employeeCount, 0), 0) ?? 0;

  return (
    <div>
      <h1 className="text-2xl font-bold">Сеть</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {status === "ready" ? `${cities?.length ?? 0} городов · ${totalClubs} клубов · ${totalEmployees} сотрудников` : "Загрузка…"}
      </p>

      {status === "ready" && cities && (
        <div className="mt-6 space-y-4">
          {cities.map((city) => (
            <div key={city.id} className="rounded-3xl border border-border bg-card p-5">
              <p className="inline-flex items-center gap-2 text-base font-bold">
                <MapPin className="size-4 text-brand" /> {city.name}
              </p>
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {city.clubs.map((club) => (
                  <div key={club.id} className="flex items-center justify-between rounded-2xl border border-border px-3 py-2.5 text-sm">
                    <span className="inline-flex items-center gap-2">
                      <Building2 className="size-4 text-muted-foreground" /> {club.name}
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Users className="size-3.5" /> {club.employeeCount}
                    </span>
                  </div>
                ))}
                {city.clubs.length === 0 && <p className="text-sm text-muted-foreground">Нет активных клубов.</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
