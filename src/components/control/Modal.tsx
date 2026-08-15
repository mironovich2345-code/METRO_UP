"use client";

import { useEffect } from "react";
import { cn } from "@/lib/utils";

/**
 * Shared Control modal. The OVERLAY itself is the scroll container, so the mouse
 * wheel scrolls the dialog from anywhere over it (not only over a narrow inner
 * region), header/footer always stay reachable, and background scroll is locked
 * (with scrollbar-gutter compensation) so the wheel never leaks to the page
 * behind. `overscroll-contain` stops scroll chaining. Esc and backdrop click
 * close. Used by every Control/admin/spm modal for consistent behaviour.
 */
const SIZES = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
  "2xl": "max-w-2xl",
} as const;

export function Modal({
  onClose,
  children,
  size = "lg",
  className,
}: {
  onClose: () => void;
  children: React.ReactNode;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);

    // Lock background scroll without a layout shift (compensate the scrollbar).
    const body = document.body;
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    const prevOverflow = body.style.overflow;
    const prevPad = body.style.paddingRight;
    body.style.overflow = "hidden";
    if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;

    return () => {
      document.removeEventListener("keydown", onKey);
      body.style.overflow = prevOverflow;
      body.style.paddingRight = prevPad;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-black/40" onClick={onClose}>
      <div className="flex min-h-full items-start justify-center p-4 sm:items-center">
        <div
          className={cn(
            "relative my-4 w-full rounded-3xl border border-border bg-card p-6 shadow-2xl sm:my-8",
            SIZES[size],
            className,
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
