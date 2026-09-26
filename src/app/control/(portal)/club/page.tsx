"use client";

import { Suspense } from "react";
import { ClubManagerCabinet } from "@/components/control/ClubManagerCabinet";
import { CabinetSkeleton } from "@/components/control/cabinet-ui";

/**
 * "Управляющий" cabinet — /control/club[?clubId=...]. Sprint: role-cabinets,
 * step 6, section 2.
 *
 * ROUTING DECISION: a NEW route, not a retrofit of /control/team.
 * /control/team is the existing, separate operational admin tool (task
 * templates, sales/mystery-shopper input, the full plan-management surface)
 * — explicitly out of this step's scope (section 22: no new plan-assignment
 * system) and used by more than just a CLUB_MANAGER's own view. This route
 * is the curated PERSONAL cabinet (section 0's "functional... cabinet for
 * the manager of a club"), the CLUB_MANAGER analogue of /control/city built
 * in step 5 — same pattern, same visual language, its own route.
 *
 * NO page-level role gate here (unlike /control/city's server-component
 * check) — deliberately, mirroring /control/team/page.tsx's own existing
 * pattern: this route must also work for a CITY_MANAGER actively previewing
 * via View As CLUB_MANAGER (their REAL role is CITY_MANAGER, not
 * CLUB_MANAGER — a naive page-level "must hold CLUB_MANAGER" check would
 * incorrectly block that preview before the API's own View-As-aware
 * authorization ever runs). All real authorization — real CLUB_MANAGER
 * grant, active View-As-CLUB_MANAGER preview, or denial — happens
 * server-side in resolveClubManagerCabinetAccess (step 4), unaffected by
 * anything here; the outer control/(portal)/layout.tsx gate still keeps a
 * plain MANAGER out before this page ever mounts.
 */
export default function ControlClubPage() {
  return (
    <Suspense fallback={<CabinetSkeleton />}>
      <ClubManagerCabinet />
    </Suspense>
  );
}
