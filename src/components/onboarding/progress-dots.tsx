"use client";

import { Fragment } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { springSoft } from "@/lib/motion";

interface ProgressDotsProps {
  /** Ordered stage labels. */
  steps: string[];
  /** 0-based index of the active stage. */
  current: number;
}

/** Compact ● ━ ● ━ ● progress indicator for onboarding. */
export function ProgressDots({ steps, current }: ProgressDotsProps) {
  return (
    <div
      className="flex flex-col gap-2"
      role="progressbar"
      aria-valuemin={1}
      aria-valuemax={steps.length}
      aria-valuenow={current + 1}
      aria-label={steps[current]}
    >
      <div className="flex items-center">
        {steps.map((label, i) => {
          const reached = i <= current;
          return (
            <Fragment key={label}>
              <motion.span
                animate={{ scale: i === current ? 1.25 : 1 }}
                transition={springSoft}
                className={cn(
                  "size-2.5 shrink-0 rounded-full transition-colors",
                  reached ? "bg-brand" : "bg-muted",
                )}
              />
              {i < steps.length - 1 && (
                <span
                  className={cn(
                    "mx-1 h-0.5 flex-1 rounded-full transition-colors",
                    i < current ? "bg-brand" : "bg-muted",
                  )}
                />
              )}
            </Fragment>
          );
        })}
      </div>
      <p className="text-xs font-semibold text-muted-foreground">
        {steps[current]}
      </p>
    </div>
  );
}
