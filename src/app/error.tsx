"use client";

import { useEffect } from "react";
import { RotateCw } from "lucide-react";

/**
 * Route-segment error boundary. An uncaught client render error must never become
 * a permanent black screen — show a recoverable fallback with a working retry.
 * This is a safety net; the normal bootstrap loading/error flow (EmployeeBootGate)
 * is expected to handle the common cases WITHOUT throwing.
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(`[app-error] ${JSON.stringify({ name: error?.name ?? "Error", digest: error?.digest ?? null })}`);
  }, [error]);

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-5 px-8 text-center">
      <div>
        <p className="text-lg font-bold">Что-то пошло не так</p>
        <p className="mt-1.5 text-sm text-muted-foreground">Попробуйте открыть приложение ещё раз.</p>
      </div>
      <button
        type="button"
        onClick={() => reset()}
        className="inline-flex items-center gap-2 rounded-2xl bg-brand px-5 py-3 text-sm font-semibold text-brand-foreground"
      >
        <RotateCw className="size-4" /> Повторить
      </button>
    </div>
  );
}
