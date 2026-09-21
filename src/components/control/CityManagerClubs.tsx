"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Eye, Users } from "lucide-react";
import Link from "next/link";
import { ApiError } from "@/lib/api/client";
import { cityApi, viewAsApi, type ClubSummaryDTO } from "@/lib/api/roles-client";

/**
 * Sprint 1 / Phase 2B, section 18 — minimal CITY_MANAGER UI: "Мои клубы" list
 * with a link into each club's Team (the new authorize({action:"club.read"})
 * path, control/team?clubId=) and a View As trigger ("Просмотреть как
 * управляющий") so the CITY_MANAGER can see exactly what a CLUB_MANAGER of
 * that club would see. No назначение/revoke UI here by design — that lives
 * on control/team itself (reused, not rebuilt) once the CITY_MANAGER is
 * looking at a specific club's team, matching "Использовать существующий
 * Team там, где возможно" from the Phase 2B plan.
 */
export function CityManagerClubs() {
  const router = useRouter();
  const [clubs, setClubs] = useState<ClubSummaryDTO[] | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "denied">("loading");
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    cityApi.clubs()
      .then((d) => { setClubs(d.clubs); setStatus("ready"); })
      .catch((e) => setStatus(e instanceof ApiError && (e.status === 403 || e.status === 401) ? "denied" : "error"));
  }, []);

  const viewAsManager = async (clubId: string) => {
    setBusyId(clubId);
    try {
      await viewAsApi.start({ role: "CLUB_MANAGER", clubId });
      router.push("/control/team");
    } catch {
      setBusyId(null);
    }
  };

  if (status === "denied") return <p className="text-sm text-muted-foreground">Недостаточно прав.</p>;
  if (status === "error") return <p className="text-sm text-red-500">Не удалось загрузить клубы.</p>;

  return (
    <div>
      <h1 className="text-2xl font-bold">Мои клубы</h1>
      <p className="mt-1 text-sm text-muted-foreground">Клубы в вашей зоне ответственности.</p>

      {status === "ready" && clubs && (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {clubs.map((c) => (
            <div key={c.id} className="rounded-3xl border border-border bg-card p-5">
              <span className="flex size-11 items-center justify-center rounded-2xl bg-brand/12">
                <Building2 className="size-5 text-brand" />
              </span>
              <p className="mt-3 text-lg font-bold">{c.name}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">{c.cityName}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  href={`/control/team?clubId=${c.id}`}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-1.5 text-xs font-semibold"
                >
                  <Users className="size-3.5" /> Команда
                </Link>
                <button
                  onClick={() => viewAsManager(c.id)}
                  disabled={busyId === c.id}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-3 py-1.5 text-xs font-semibold text-brand-foreground disabled:opacity-50"
                >
                  <Eye className="size-3.5" /> {busyId === c.id ? "…" : "Просмотреть как управляющий"}
                </button>
              </div>
            </div>
          ))}
          {clubs.length === 0 && (
            <p className="col-span-full py-10 text-center text-muted-foreground">В вашей зоне пока нет клубов.</p>
          )}
        </div>
      )}
    </div>
  );
}
