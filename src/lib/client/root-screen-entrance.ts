"use client";

import { useEffect, useState } from "react";
import { rootScreenEntranceInitial } from "@/lib/motion";

/**
 * Sprint: LIVE QA FIX QA-01B — whether any root tab screen has already been
 * shown in this Mini App session. Module-level on purpose: it lives exactly
 * as long as this JS realm, so it survives every client-side navigation and
 * is reset only by a full reload (a cold open, or ContextRecoveryScreen's
 * own reload) — which is precisely when the entrance reveal should play
 * again. Never persisted anywhere; carries no user data.
 */
let rootScreenShown = false;

/**
 * The `initial` prop for a root tab screen's staggerStack container — see
 * rootScreenEntranceInitial (motion.ts) for the full root-cause reasoning.
 * Captured once per mount (useState initializer), so it never changes under
 * an already-mounted screen; the flag is flipped in an effect, after the
 * first root screen has actually committed, never during render.
 */
export function useRootScreenEntrance(): "hidden" | false {
  const [initial] = useState(() => rootScreenEntranceInitial(rootScreenShown));
  useEffect(() => {
    rootScreenShown = true;
  }, []);
  return initial;
}
