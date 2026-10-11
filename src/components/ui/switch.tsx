"use client";

import { cn } from "@/lib/utils";
import { switchGeometry } from "@/lib/switch-geometry";

const GEOMETRY = switchGeometry();

/**
 * Sprint: LIVE QA QA-04, section C — the app's toggle switch. Every size is
 * taken from switchGeometry(): the thumb is pinned at `left/top = inset`
 * (never left to the button's centred static position) and moves by exactly
 * `travel`, so it ends `inset` px from the right edge in the ON state on any
 * viewport.
 */
export function Switch({
  checked,
  onCheckedChange,
  disabled,
  className,
  ...aria
}: {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      style={{ width: GEOMETRY.trackWidth, height: GEOMETRY.trackHeight }}
      className={cn(
        "relative box-border inline-block shrink-0 rounded-full border-0 p-0 transition-colors disabled:opacity-60",
        checked ? "bg-brand" : "bg-muted",
        className,
      )}
      {...aria}
    >
      <span
        aria-hidden
        style={{
          left: GEOMETRY.inset,
          top: GEOMETRY.inset,
          width: GEOMETRY.thumbSize,
          height: GEOMETRY.thumbSize,
          transform: `translateX(${checked ? GEOMETRY.travel : 0}px)`,
        }}
        className="absolute block rounded-full bg-white shadow transition-transform"
      />
    </button>
  );
}
