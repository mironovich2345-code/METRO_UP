"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useApp } from "@/providers/app-provider";
import { PendingApprovalScreen } from "./PendingApprovalScreen";
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
 */

/** Onboarding itself is never gated — a not-yet-onboarded or actively
 * onboarding user has no accessStatus concern yet (profile is null). */
const ONBOARDING_PREFIXES = ["/welcome", "/setup"];

/** The approved LIMITED whitelist's ROUTES (mirrors requireLimitedOrFullAccess's
 * API whitelist — home/plan/metric/scripts/instructions/xp/rating/achievements
 * are FULL-only and would 403 if reached). */
const ALLOWED_FOR_LIMITED = ["/profile", "/academy", ...ONBOARDING_PREFIXES];

export function AccessStatusGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { hydrated, isOnboarded, profile } = useApp();

  const status = profile?.accessStatus ?? null;
  const isOnboardingRoute = ONBOARDING_PREFIXES.some((p) => pathname?.startsWith(p));
  const isAllowedForLimited = ALLOWED_FOR_LIMITED.some((p) => pathname?.startsWith(p));
  const shouldRedirectLimited = status === "LIMITED" && !isAllowedForLimited;

  // Redirect (not render-block) a LIMITED user off a FULL-only route — Academy
  // is a sensible landing spot, unlike Pending/Suspended there IS somewhere
  // for them to go.
  useEffect(() => {
    if (!hydrated || !isOnboarded || isOnboardingRoute) return;
    if (shouldRedirectLimited) router.replace("/academy");
  }, [hydrated, isOnboarded, isOnboardingRoute, shouldRedirectLimited, router]);

  // Not yet resolved, not onboarded, or actively onboarding: never block —
  // that state belongs to the Splash/Welcome/Setup flow, not this gate.
  if (!hydrated || !isOnboarded || isOnboardingRoute) return <>{children}</>;

  if (status === "SUSPENDED") return <SuspendedScreen />;
  if (status === "PENDING_APPROVAL") return <PendingApprovalScreen />;
  if (shouldRedirectLimited) return null; // redirecting via the effect above
  return <>{children}</>;
}
