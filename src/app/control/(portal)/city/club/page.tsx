import { getCurrentUser } from "@/lib/server/session";
import { getActorContext } from "@/lib/server/rbac/context";
import { hasActiveRole } from "@/lib/server/rbac/scope-core";
import { AccessDenied } from "@/components/control/AccessDenied";
import { CityManagerClubDetail } from "@/components/control/CityManagerClubDetail";

export const dynamic = "force-dynamic";

/**
 * CITY_MANAGER's read-only club detail — /control/city/club?clubId=...
 * Sprint: role-cabinets, step 5, section 8. Mirrors /control/team's
 * ?clubId= convention (no new dynamic-route pattern introduced). This
 * page-level check is the same coarse UX gate as /control/city — the real,
 * per-club authorization (does THIS clubId fall in this actor's scope) is
 * enforced server-side by /api/control/cabinet/club-manager[/team], which
 * CityManagerClubDetail calls; an out-of-scope clubId renders the
 * component's own "denied" state, not a broken page.
 */
export default async function ControlCityClubPage({
  searchParams,
}: {
  searchParams: Promise<{ clubId?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) return null;
  const actor = await getActorContext(user);
  if (!hasActiveRole(actor.grants, "CITY_MANAGER")) {
    return <AccessDenied message="Раздел «Ст. города» доступен Ст. города." />;
  }
  const { clubId } = await searchParams;
  if (!clubId) return <p className="text-sm text-muted-foreground">Клуб не указан.</p>;
  return <CityManagerClubDetail clubId={clubId} />;
}
