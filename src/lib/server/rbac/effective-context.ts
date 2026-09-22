import "server-only";
import type { AppRole } from "@prisma/client";
import type { CurrentUser } from "../session";
import { resolveViewContext, type ViewContext } from "./view-as";
import { cityIdForClub } from "./context";

/**
 * Sprint 1 / Phase 2D — the single centralized "what should this request
 * render as" resolver. Built on top of view-as.ts's resolveViewContext
 * (Phase 2B/2C), which already re-validates scope against the real actor's
 * CURRENT grants on every call — this module adds nothing to the
 * authorization decision, only to what read paths RENDER once a preview is
 * already confirmed valid.
 *
 * Hard invariant, enforced by construction (not by convention): authorization
 * checks (requireFullAccess() etc.), the audit actorId, and every WRITE path
 * MUST use realUser — this module never returns anything that could stand in
 * for an authorization identity. effectiveUser exists ONLY to be read FROM
 * (destructured into a DTO, passed as a Prisma `where: { userId }` filter);
 * it is a plain in-memory object, never persisted, never looked up by id.
 *
 * "RealActorContext + ViewContext = EffectiveReadContext" (Sprint 1 plan
 * wording): RealActorContext is realUser (+ whatever getActorContext(realUser)
 * separately resolves for authorization, untouched by this file); ViewContext
 * is view-as.ts's existing type; this file is the "=" — the one place that
 * combines them into something read paths can consume without each of ~10
 * routes re-implementing the same branch.
 */

/**
 * Fixed sentinel id for the in-memory, non-persisted preview persona —
 * deliberately the nil UUID. Guaranteed to never collide with a real
 * uuid()-generated row, and every `WHERE userId = <this>` read (XP, rating,
 * achievements, lesson progress, daily tasks) correctly returns empty/zero
 * results rather than another real user's data, since Prisma reads don't
 * require the referenced row to exist. It must NEVER reach a write: several
 * "read" endpoints (Home, Daily Plan) have a "materialize on read" side
 * effect (daily-plan.ts's ensureTodayTasks -> DailyTask insert) that is a
 * real INSERT with a NOT NULL foreign key to `users.id` — inserting against
 * this id would either throw a foreign-key violation (breaking the preview)
 * or, if the FK were ever relaxed, silently create orphan rows tied to a
 * fake user. Callers with such a side effect must special-case isPreviewing
 * and skip/stub it — see home.ts's getHomeDashboardEffective and
 * daily-plan.ts's getPlanTodayEffective — never call the writing function
 * with effectiveUser.
 */
export const SYNTHETIC_PERSONA_ID = "00000000-0000-0000-0000-000000000000";

export interface EffectiveReadContext {
  /** The REAL, authenticated user. Authorization decisions, the audit
   * actorId, and every WRITE path MUST use this — never effectiveUser. */
  realUser: CurrentUser;
  /** Active View As context for this request, or null when not previewing. */
  viewContext: ViewContext | null;
  /**
   * True iff a preview is active AND it's one the Mini-App read routes
   * substitute a persona for (MANAGER/CLUB_MANAGER). CITY_MANAGER
   * self-preview (VIEWAS-E, "jump back to top-level view") resolves to
   * false — the real actor already IS a CITY_MANAGER, there's nothing to
   * substitute, and reads should simply proceed as the real user.
   */
  isPreviewing: boolean;
  /**
   * The user-shaped object read paths should render FROM. Equals realUser
   * when not previewing; a non-persisted, in-memory synthetic object when
   * previewing (id = SYNTHETIC_PERSONA_ID). NEVER an authorization identity,
   * NEVER an audit actor, NEVER passed to a write.
   */
  effectiveUser: CurrentUser;
}

/** Resolve the effective read context for the current request. realUser must
 * already have passed whatever access() check the route requires (Academy's
 * requireLimitedOrFullAccess, Home's requireFullAccess, etc.) — that
 * decision is unaffected by this function and made against realUser only. */
type PersonaRole = "MANAGER" | "CLUB_MANAGER";

function isPersonaPreview(vc: ViewContext): vc is ViewContext & { previewRole: PersonaRole } {
  return vc.previewRole === "MANAGER" || vc.previewRole === "CLUB_MANAGER";
}

export async function resolveEffectiveReadContext(realUser: CurrentUser): Promise<EffectiveReadContext> {
  const viewContext = await resolveViewContext(realUser);
  if (!viewContext || !isPersonaPreview(viewContext)) {
    return { realUser, viewContext, isPreviewing: false, effectiveUser: realUser };
  }
  const effectiveUser = await buildSyntheticPersona(viewContext);
  return { realUser, viewContext, isPreviewing: true, effectiveUser };
}

const PREVIEW_ROLE_LABEL: Record<PersonaRole, string> = {
  MANAGER: "Менеджер",
  CLUB_MANAGER: "Управляющий",
};

/** MANAGER/CLUB_MANAGER previews are always club-scoped (startViewAsSchema
 * requires clubId for both — see view-as-schemas.ts); CITY_MANAGER-scope
 * previews never reach here (filtered by isPersonaPreview above). */
async function buildSyntheticPersona(ctx: ViewContext & { previewRole: PersonaRole }): Promise<CurrentUser> {
  const clubId = ctx.previewClubId;
  if (!clubId) {
    // Unreachable given startViewAsSchema's validation, but fail loudly
    // rather than silently resolving to a club-less (and thus meaningless)
    // persona if that invariant is ever broken upstream.
    throw new Error("invariant violated: MANAGER/CLUB_MANAGER view context missing previewClubId");
  }
  const cityId = (await cityIdForClub(clubId)) ?? "";
  const legacyRole: AppRole = ctx.previewRole === "CLUB_MANAGER" ? "CLUB_MANAGER" : "EMPLOYEE";
  const epoch = new Date(0); // fixed, never rendered — no screen shows profile timestamps

  return {
    id: SYNTHETIC_PERSONA_ID,
    telegramId: "view-as-preview", // never a valid real Telegram id; never persisted
    telegramUsername: null,
    telegramFirstName: null,
    telegramLastName: null,
    telegramPhotoUrl: null,
    displayName: `${PREVIEW_ROLE_LABEL[ctx.previewRole]} (просмотр)`,
    role: legacyRole,
    createdAt: epoch,
    updatedAt: epoch,
    lastLoginAt: null,
    employeeProfile: {
      id: SYNTHETIC_PERSONA_ID,
      userId: SYNTHETIC_PERSONA_ID,
      cityId,
      clubId,
      positionId: ctx.previewPositionId,
      careerLevel: "NEWCOMER",
      // Always FULL, independent of the real actor's own accessStatus — a
      // preview shows what a normally-functioning MANAGER/CLUB_MANAGER
      // sees, never a simulated LIMITED/PENDING/SUSPENDED employee, and
      // must never inherit the real actor's own (unrelated) status either.
      accessStatus: "FULL",
      onboardingCompleted: true,
      createdAt: epoch,
      updatedAt: epoch,
    },
  };
}
