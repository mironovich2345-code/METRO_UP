import { getCurrentUser } from "@/lib/server/session";
import { getActorContext } from "@/lib/server/rbac/context";
import { hasActiveRole } from "@/lib/server/rbac/scope-core";
import { AccessDenied } from "@/components/control/AccessDenied";
import { CityManagerCabinet } from "@/components/control/CityManagerCabinet";

export const dynamic = "force-dynamic";

/**
 * "Ст. города" cabinet — CITY_MANAGER only. Sprint: role-cabinets, step 5.
 * Supersedes the Phase 2B "Мои клубы" list (CityManagerClubs.tsx, removed
 * this step) at the SAME route — this page-level check is a coarse,
 * UX-only gate (a nice AccessDenied instead of a raw 403); the real,
 * per-request authorization lives server-side in
 * /api/control/cabinet/city-manager, which CityManagerCabinet calls.
 */
export default async function ControlCityPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  const actor = await getActorContext(user);
  if (!hasActiveRole(actor.grants, "CITY_MANAGER")) {
    return <AccessDenied message="Раздел «Ст. города» доступен Ст. города." />;
  }
  return <CityManagerCabinet />;
}
