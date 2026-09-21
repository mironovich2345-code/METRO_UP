import { getCurrentUser } from "@/lib/server/session";
import { getActorContext } from "@/lib/server/rbac/context";
import { hasActiveRole } from "@/lib/server/rbac/scope-core";
import { AccessDenied } from "@/components/control/AccessDenied";
import { CityManagerClubs } from "@/components/control/CityManagerClubs";

export const dynamic = "force-dynamic";

/** "Мои клубы" — CITY_MANAGER only (Sprint 1 / Phase 2B). */
export default async function ControlCityPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  const actor = await getActorContext(user);
  if (!hasActiveRole(actor.grants, "CITY_MANAGER")) {
    return <AccessDenied message="Раздел «Мои клубы» доступен Ст. города." />;
  }
  return <CityManagerClubs />;
}
