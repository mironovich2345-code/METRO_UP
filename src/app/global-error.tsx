"use client";

import { useEffect } from "react";

/**
 * Fatal (root-layout) error boundary. Replaces the whole document, so it renders
 * its own <html>/<body> with inline styles (the root layout — and globals.css —
 * are not available here). A crash must never leave a permanently black Mini App:
 * offer retry + a hard reload.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(`[app-global-error] ${JSON.stringify({ name: error?.name ?? "Error", digest: error?.digest ?? null })}`);
  }, [error]);

  return (
    <html lang="ru">
      <body style={{ margin: 0, minHeight: "100dvh", background: "#09090b", color: "#fafafa", fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif" }}>
        <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: "0 32px", textAlign: "center" }}>
          <div>
            <p style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>Что-то пошло не так</p>
            <p style={{ marginTop: 6, fontSize: 14, color: "#a1a1aa" }}>Попробуйте открыть приложение ещё раз.</p>
          </div>
          <button
            type="button"
            onClick={() => { try { reset(); } catch { window.location.reload(); } }}
            style={{ background: "#ffd60a", color: "#0a0a0a", border: 0, borderRadius: 16, padding: "12px 20px", fontSize: 14, fontWeight: 600 }}
          >
            Повторить
          </button>
        </div>
      </body>
    </html>
  );
}
