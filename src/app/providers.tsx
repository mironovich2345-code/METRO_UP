"use client";

import { ThemeProvider } from "@/providers/theme-provider";
import { AppProvider } from "@/providers/app-provider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <AppProvider>{children}</AppProvider>
    </ThemeProvider>
  );
}
