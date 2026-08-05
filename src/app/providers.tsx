"use client";

import { usePathname, useRouter } from "next/navigation";
import {
  TelegramProvider,
  useTelegramBackButton,
} from "@/providers/TelegramProvider";
import { ThemeProvider } from "@/providers/theme-provider";
import { AppProvider } from "@/providers/app-provider";

/** Wires the native Telegram BackButton on detail routes (e.g. a course page). */
function TelegramChrome() {
  const pathname = usePathname();
  const router = useRouter();
  const isDetail = /^\/academy\/[^/]+$/.test(pathname ?? "");
  useTelegramBackButton(isDetail, () => router.back());
  return null;
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
