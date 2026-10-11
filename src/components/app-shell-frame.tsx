"use client";

import { usePathname } from "next/navigation";
import { Loader2, RotateCw } from "lucide-react";
import { AccessStatusGate } from "@/components/access/AccessStatusGate";
import { ViewAsBanner } from "@/components/control/ViewAsBanner";
import { EmployeeBootGate } from "@/components/employee-boot-gate";
import { useAppUser } from "@/providers/AppUserProvider";
import { canRenderAppBody, isDesynced } from "@/lib/context-transition";
import { viewAsApi } from "@/lib/api/roles-client";

/**
 * Wraps employee (Telegram Mini App) routes in the mobile `.app-shell`
 * (max-width 480px column) but lets the desktop web control portal render
 * full-width. `/control`, `/admin/*`, `/spm/*` are the desktop-first control
 * area; everything else stays mobile-first. Keeps all URLs unchanged.
 *
 * The control/admin/spm portal is NOT wrapped in any of the three gates
 * below — its access model is the legacy AppRole/RoleAssignment hierarchy
 * (requireRole / requireSystemAccess / authorize()), not
 * EmployeeProfile.accessStatus, and its actors (CLUB_MANAGER/SPM/ADMIN/
 * PROJECT_ADMIN) typically carry no EmployeeProfile at all — see authz.ts's
 * requireActiveAccess doc comment. It has its own portal guards
 * (control/(portal)/layout.tsx).
 *
 * Employee routes pass through three gates, outermost first, each solving a
 * different problem and none replacing another:
 *  1. EmployeeBootGate (P0 black-screen fix) — resolves the bootstrap phase
 *     FIRST: loading → a real loader; error → a recoverable retry screen;
 *     ready → render everything below. Nothing past this point has a
 *     meaningful `user` yet while bootstrap hasn't settled, so it must sit
 *     outermost — a not-yet-resolved bootstrap has no identity for the View
 *     As banner or AccessStatusGate to act on regardless.
 *  2. ViewAsBanner (Sprint 1 / Phase 2D) — rendered whenever /api/auth/me's
 *     `viewContext` is set (a CITY_MANAGER's MANAGER/CLUB_MANAGER preview is
 *     active — see rbac/effective-context.ts). One banner here covers every
 *     Mini-App screen (Home, Academy, Knowledge, Ranking, Profile, …)
 *     without each needing its own check.
 *  3. AccessStatusGate — picks which screen renders based on
 *     EmployeeProfile.accessStatus (LIMITED/PENDING_APPROVAL/SUSPENDED).
 *
 * Sprint: LIVE QA FIX QA-01 — while `isContextSwitching` is true (a View-As
 * start/end is in flight — see AppUserProvider's own doc comment for the
 * full trace of the bug this closes), an opaque ContextTransitionOverlay is
 * stacked ON TOP of the banner/`children` (z-indexed above, not swapped in
 * for them) — covering the ENTIRE viewport so neither the OLD persona's UI
 * nor a half-confirmed NEW one is ever visible during the switch, while the
 * triggering screen (ViewAsBanner, or whichever page's own button started
 * the switch) stays MOUNTED underneath. This deliberately does NOT
 * conditionally unmount the banner/`children`: that was the first design
 * tried, and it silently broke error recovery — a failed switch remounts
 * `children` as a FRESH component instance, discarding whatever local
 * state (e.g. the triggering button's own error message) the `catch`
 * block was about to set on the now-gone instance. Covering instead of
 * replacing keeps every local `error`/`busy` state intact across the
 * whole switch, success or failure. `canRenderAppBody` (context-
 * transition.ts, pure) is the shared predicate — this is the only call
 * site that acts on it.
 *
 * Sprint: LIVE QA FIX QA-01.1 — a THIRD, mutually exclusive outcome:
 * `contextTransitionPhase === "desynced"` means the server-side switch
 * SUCCEEDED but identity confirmation did not (see confirmIdentity's own
 * doc comment, AppUserProvider.tsx). The last CONFIRMED AppUser is now
 * stale relative to the server, so it may never be revealed as if nothing
 * happened — ContextRecoveryScreen renders instead of
 * ContextTransitionOverlay, covering everything the same way, but with no
 * way out except the full reload its own button performs (no retry button
 * that could race the same confirmation again, no auto-reload loop).
 */
const FULL_WIDTH_PREFIXES = ["/control", "/admin", "/spm"];

export function AppShellFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, switchContext, confirmIdentity, contextTransitionPhase } = useAppUser();
  if (FULL_WIDTH_PREFIXES.some((p) => pathname?.startsWith(p))) return <>{children}</>;

  /**
   * Sprint: LIVE QA FIX QA-01 — the GLOBAL "Выйти из режима просмотра" exit
   * flow. Previously ViewAsBanner called `fetch("/api/control/view-as/end")`
   * directly (bypassing viewAsApi.end()'s clearAllQueries()) and fired
   * `onEnded()` without awaiting it, so this function returned — and the
   * banner re-enabled itself — before the new identity was ever confirmed;
   * nothing hid the still-mounted preview screen for the whole round trip.
   * Now the ENTIRE lifecycle (server end call + cache clear + identity
   * confirmation) runs inside switchContext's atomic gate: the transition
   * overlay below covers the app body for the full duration, and
   * ViewAsBanner's own `end()` awaits this to completion before re-enabling
   * its button either way (success or failure).
   */
  const endViewAsAtomically = () =>
    switchContext(async () => {
      await viewAsApi.end();
      await confirmIdentity();
    });

  return (
    <div className="app-shell">
      <EmployeeBootGate>
        {user?.viewContext && (
          <ViewAsBanner
            previewRole={user.viewContext.previewRole}
            realRoleLabel={user.viewContext.realRoleLabel}
            scopeLabel={user.viewContext.scopeLabel}
            onEnded={endViewAsAtomically}
          />
        )}
        <AccessStatusGate>{children}</AccessStatusGate>
        {isDesynced(contextTransitionPhase) ? (
          <ContextRecoveryScreen />
        ) : (
          !canRenderAppBody(contextTransitionPhase) && <ContextTransitionOverlay />
        )}
      </EmployeeBootGate>
    </div>
  );
}

/**
 * Sprint: LIVE QA FIX QA-01, section 7 — deliberately minimal: the existing
 * dark app background, the existing brand wordmark/spinner pairing
 * EmployeeBootGate's own "loading" phase already uses (same visual
 * language, not a new one), and the one required copy line. No skeleton
 * cards, no previous role/club name — nothing that could hint at either
 * the old or the new persona while neither is confirmed on screen yet.
 * `fixed inset-0` + a high z-index + an opaque background stacks this ON
 * TOP of (never replacing) the banner/`children` below — see this file's
 * own module doc for why covering, not unmounting, is the deliberate
 * choice here. The fixed overlay also naturally blocks every pointer
 * event to whatever is underneath, which is section 18's double-submit
 * protection — no separate debounce/disabled-prop plumbing needed.
 */
function ContextTransitionOverlay() {
  return (
    <div className="fixed inset-0 z-[100] flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-background text-center">
      <p className="text-xl font-extrabold tracking-tight">METRO UP</p>
      <Loader2 className="size-6 animate-spin text-brand" />
      <p className="text-sm text-muted-foreground">Переключаем кабинет…</p>
    </div>
  );
}

/**
 * Sprint: LIVE QA FIX QA-01.1 — the ONLY way out of "desynced" is a full
 * application reload: `window.location.reload()` re-runs the ENTIRE
 * Telegram bootstrap from scratch (AppUserProvider's own `bootstrap()`),
 * which re-authenticates against whatever the server's session/cookie
 * ACTUALLY is right now — the one unconditionally authoritative source,
 * never a guess reconciled client-side. Deliberately a single explicit
 * button, not an automatic reload: an auto-reload that itself fails would
 * need its own loop guard to avoid repeating forever, which is exactly the
 * complexity the brief says to avoid by preferring an explicit user action
 * instead. No skeleton, no previous role/club name — same minimal
 * language as ContextTransitionOverlay, with its own distinct copy and a
 * recovery action instead of a spinner.
 */
function ContextRecoveryScreen() {
  return (
    <div className="fixed inset-0 z-[100] flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-background px-8 text-center">
      <p className="text-xl font-extrabold tracking-tight">METRO UP</p>
      <div>
        <p className="text-base font-bold">Не удалось обновить кабинет</p>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Контекст уже изменён, но приложение не смогло получить актуальные данные.
        </p>
      </div>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="inline-flex items-center gap-2 rounded-2xl bg-brand px-5 py-3 text-sm font-semibold text-brand-foreground"
      >
        <RotateCw className="size-4" /> Обновить приложение
      </button>
    </div>
  );
}
