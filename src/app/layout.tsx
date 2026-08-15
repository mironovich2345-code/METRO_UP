import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";
import { Providers } from "./providers";
import { AppShellFrame } from "@/components/app-shell-frame";

export const metadata: Metadata = {
  title: "Metro — Академия",
  description:
    "Metro — обучение и развитие команды MetroFitness. Курсы, рейтинг и карьерный рост в одном приложении.",
  applicationName: "Metro",
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f7f8" },
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        {/* Apply the saved theme before first paint — no light/dark flash on
            reload (Web Control especially). Runs synchronously during HTML parse;
            the ThemeProvider reconciles Telegram colorScheme afterwards. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var m=localStorage.getItem('metro.theme')||'system';var d=m==='dark'||(m==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);var e=document.documentElement;e.classList.toggle('dark',d);e.style.colorScheme=d?'dark':'light';}catch(_){}})();",
          }}
        />
        {/* Telegram Mini Apps runtime — provides window.Telegram.WebApp */}
        <Script
          src="https://telegram.org/js/telegram-web-app.js"
          strategy="beforeInteractive"
        />
      </head>
      <body>
        <Providers>
          <AppShellFrame>{children}</AppShellFrame>
        </Providers>
      </body>
    </html>
  );
}
