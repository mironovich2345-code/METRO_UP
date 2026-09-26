"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useApp } from "@/providers/app-provider";
import { SuspendedScreen } from "./SuspendedScreen";

/**
 * Access-aware Mini App shell (Sprint 1 / Phase 2B, section 9 — the audit's
 * "critical blocker": a LIMITED/PENDING_APPROVAL/SUSPENDED employee used to
 * hit a Home full of failed 403s instead of a coherent screen).
 *
 * THE SERVER IS THE ONLY REAL AUTHORITY. Every protected route independently
 * enforces accessStatus server-side (requireActiveAccess /
 * requireLimitedOrFullAccess / requireFullAccess, src/lib/server/authz.ts) —
 * this component changes nothing about what the server allows; it only picks
 * which screen to render so a restricted employee isn't left looking at a
 * broken app. A direct API call from outside this UI is still blocked
 * exactly the same regardless of what renders here.
 *
 * Sprint: mini-app-role-experience, section 2 — PENDING_APPROVAL is NO LONGER
 * a full-screen block (PendingApprovalScreen retired, was "the mysterious
 * single Academy tab" this section explicitly called out as unacceptable).
 * `/api/home` now serves that state its own honest OnboardingHomeDTO and the
 * bottom nav already narrows to Главная/Академия (nav-items.ts) — so
 * PENDING_APPROVAL is handled exactly like LIMITED here: allowed on its
 * approved routes, redirected off anything else, never render-blocked.
 * SUSPENDED remains the one true full-screen stop (no route is safe for it).
 */

/** Onboarding itself is never gated — a not-yet-onboarded or actively
 * onboarding user has no accessStatus concern yet (profile is null). */
const ONBOARDING_PREFIXES = ["/welcome", "/setup"];

/** The approved LIMITED whitelist's ROUTES (mirrors requireLimitedOrFullAccess's
 * API whitelist — home/plan/metric/scripts/instructions/xp/rating/achievements
 * are FULL-only and would 403 if reached). */
const ALLOWED_FOR_LIMITED = ["/profile", "/academy", ...ONBOARDING_PREFIXES];

/** Section 2's approved nav for PENDING_APPROVAL — Главная (now serving the
 * onboarding-limited Home) + Академия (now serving the onboarding-course
 * restriction, see academy.ts's isAcademyContentAllowed), plus profile/
 * onboarding same as LIMITED. Metric/База/Рейтинг/Daily Plan stay out —
 * those routes still require FULL server-side regardless of this list. */
const ALLOWED_FOR_PENDING_APPROVAL = ["/home", "/profile", "/academy", ...ONBOARDING_PREFIXES];

export function AccessStatusGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { hydrated, isOnboarded, profile } = useApp();

  const status = profile?.accessStatus ?? null;
  const isOnboardingRoute = ONBOARDING_PREFIXES.some((p) => pathname?.startsWith(p));
  const isAllowedForLimited = ALLOWED_FOR_LIMITED.some((p) => pathname?.startsWith(p));
  const isAllowedForPending = ALLOWED_FOR_PENDING_APPROVAL.some((p) => pathname?.startsWith(p));
  const shouldRedirectLimited = status === "LIMITED" && !isAllowedForLimited;
  const shouldRedirectPending = status === "PENDING_APPROVAL" && !isAllowedForPending;
  const shouldRedirect = shouldRedirectLimited || shouldRedirectPending;

  // Redirect (not render-block) a LIMITED/PENDING_APPROVAL user off a route
  // their status can't use — Academy is a sensible landing spot for both,
  // unlike Suspended there IS somewhere for them to go.
  useEffect(() => {
    if (!hydrated || !isOnboarded || isOnboardingRoute) return;
    if (shouldRedirect) router.replace("/academy");
  }, [hydrated, isOnboarded, isOnboardingRoute, shouldRedirect, router]);

  // Not yet resolved, not onboarded, or actively onboarding: never block —
  // that state belongs to the Splash/Welcome/Setup flow, not this gate.
  if (!hydrated || !isOnboarded || isOnboardingRoute) return <>{children}</>;

  if (status === "SUSPENDED") return <SuspendedScreen />;
  if (shouldRedirect) return null; // redirecting via the effect above
  return <>{children}</>;
}
