"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Reusable desktop web sign-in via the official Telegram Login Widget (no
 * passwords). Posts the signed payload to /api/auth/telegram-web, which verifies
 * the hash server-side, opens the HttpOnly session, and reads the real role from
 * PostgreSQL. Requires BotFather domain config + NEXT_PUBLIC_TELEGRAM_BOT_USERNAME.
 */
export function TelegramLoginWidget({
  redirectTo,
  title,
  subtitle,
}: {
  redirectTo: string;
  title: string;
  subtitle: string;
}) {
  const router = useRouter();
  const holder = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"idle" | "authing" | "error">("idle");
  const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;

  useEffect(() => {
    if (!botUsername || !holder.current) return;
    (window as unknown as { onTelegramAuth?: (u: Record<string, unknown>) => void }).onTelegramAuth = async (u) => {
      setStatus("authing");
      try {
        const res = await fetch("/api/auth/telegram-web", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(u),
        });
        if (!res.ok) throw new Error("auth failed");
        router.push(redirectTo);
      } catch {
        setStatus("error");
      }
    };
    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.async = true;
    script.setAttribute("data-telegram-login", botUsername);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-radius", "12");
    script.setAttribute("data-onauth", "onTelegramAuth(user)");
    script.setAttribute("data-request-access", "write");
    holder.current.appendChild(script);
  }, [botUsername, router, redirectTo]);

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background p-6 text-foreground">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-8 text-center shadow-[var(--shadow-card)]">
        <span className="mx-auto mb-4 flex size-11 items-center justify-center rounded-2xl bg-brand text-brand-foreground font-black">M</span>
        <h1 className="text-lg font-bold">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>

        {botUsername ? (
          <div ref={holder} className="mt-6 flex justify-center" />
        ) : (
          <p className="mt-6 rounded-2xl bg-muted px-4 py-3 text-sm text-muted-foreground">
            Web-вход не настроен: задайте <b>NEXT_PUBLIC_TELEGRAM_BOT_USERNAME</b> и домен бота в BotFather.
            До настройки откройте Mini App в Telegram (сессия установится), затем зайдите на панель.
          </p>
        )}

        {status === "authing" && <p className="mt-4 text-sm text-muted-foreground">Входим…</p>}
        {status === "error" && <p className="mt-4 text-sm text-red-500">Не удалось войти. Попробуйте ещё раз.</p>}
      </div>
    </div>
  );
}
