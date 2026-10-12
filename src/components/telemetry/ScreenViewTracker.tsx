"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useAppUser } from "@/providers/AppUserProvider";
import { screenViewGuard } from "@/lib/client/screen-view-guard";
import type { ScreenKey } from "@/lib/telemetry/screens";

/** Best-effort, non-blocking: navigation never waits on analytics. */
function sendScreenView(screen: ScreenKey) {
  try {
    void fetch("/api/telemetry/view", {
      method: "POST",
      credentials: "same-origin",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ screen }),
    }).catch(() => {});
  } catch {
    /* analytics must never break the app */
  }
}

/**
 * Sprint: LIVE QA QA-07 — the ONE place screen visits are recorded, mounted
 * once in the root Providers (covers the Mini App, Control and SPM). Only the
 * normalized screen key is sent — never the URL; the server derives the user
 * from the session. Mini App visits wait until the session is confirmed
 * (status "authenticated"); Control/SPM pages are server-gated already.
 */
export function ScreenViewTracker() {
  const pathname = usePathname();
  const { status } = useAppUser();
  useEffect(() => {
    const key = screenViewGuard.next(pathname, (surface) => surface !== "MINI_APP" || status === "authenticated");
    if (key) sendScreenView(key);
  }, [pathname, status]);
  return null;
}
