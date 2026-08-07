"use client";

import { usePathname, useRouter } from "next/navigation";
import {
  TelegramProvider,
  useTelegramBackButton,
} from "@/providers/TelegramProvider";
import { ThemeProvider } from "@/providers/theme-provider";
import { AppProvider } from "@/providers/app-provider";

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

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <TelegramProvider>
      <ThemeProvider>
        <AppProvider>
          <TelegramChrome />
          {children}
        </AppProvider>
      </ThemeProvider>
    </TelegramProvider>
  );
}
