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

/**
 * Reference-counted body scroll lock. Multiple stacked modals share one lock;
 * the original body styles are captured once (when the count goes 0→1) and
 * restored once (when it returns to 0). This guarantees the lock is released
 * even when a modal unmounts via route navigation (e.g. the create-lesson wizard
 * navigating to the editor) — so `body { overflow: hidden }` can never leak onto
 * the next page and kill wheel scroll.
 */
let lockCount = 0;
let savedOverflow = "";
let savedPad = "";

function acquireBodyLock() {
  const body = document.body;
  if (lockCount === 0) {
    savedOverflow = body.style.overflow;
    savedPad = body.style.paddingRight;
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    body.style.overflow = "hidden";
    if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;
  }
  lockCount += 1;
}

function releaseBodyLock() {
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount === 0) {
    document.body.style.overflow = savedOverflow;
    document.body.style.paddingRight = savedPad;
  }
}

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
    acquireBodyLock();
    return releaseBodyLock;
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
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
