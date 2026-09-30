"use client";

import { usePathname, useRouter } from "next/navigation";
import {
  TelegramProvider,
  useTelegramBackButton,
} from "@/providers/TelegramProvider";
import { PersistentCacheProvider } from "@/providers/PersistentCacheProvider";
import { AppUserProvider } from "@/providers/AppUserProvider";
import { ThemeProvider } from "@/providers/theme-provider";
import { AppProvider } from "@/providers/app-provider";
import { markBootOrigin, logBootEvent } from "@/lib/client/perf-boot";

// Sprint: mini-app-cold-start, section 2 — the origin mark for every
// perf-boot event downstream, taken at the earliest point our own client
// code runs (this module's eval time, immediately on the root Client
// Component boundary loading).
markBootOrigin();
logBootEvent("miniapp_open");

/** Native Telegram BackButton on the course detail route. */
function AcademyBack() {
  const router = useRouter();
  useTelegramBackButton(true, () => router.back());
  return null;
}

/**
 * Mount the BackButton controller only on routes that don't manage it
 * themselves (Setup owns its own step-aware BackButton).
 */
function TelegramChrome() {
  const pathname = usePathname();
  const isAcademyDetail = /^\/academy\/[^/]+$/.test(pathname ?? "");
  return isAcademyDetail ? <AcademyBack /> : null;
}

/**
 * Sprint: mini-app-cold-start, section 5 — AppUserProvider now sits ABOVE
 * PersistentCacheProvider (it used to be a child, gated behind the latter's
 * hydration). AppUserProvider's bootstrap effect fires on its OWN mount,
 * unconditionally (it never blocks rendering its children), so moving it up
 * means the real auth request now starts on the very same tick as
 * PersistentCacheProvider's IndexedDB hydration — two independent reads
 * racing in parallel, neither gating the other's start. PersistentCacheProvider
 * itself no longer blocks rendering either (see its own doc comment) — this
 * reordering plus that change together are the fix for "do not serialize
 * IndexedDB then auth then app" (see the cold-start report).
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <TelegramProvider>
      <AppUserProvider>
        <PersistentCacheProvider>
          <ThemeProvider>
            <AppProvider>
              <TelegramChrome />
              {children}
            </AppProvider>
          </ThemeProvider>
        </PersistentCacheProvider>
      </AppUserProvider>
    </TelegramProvider>
  );
}
