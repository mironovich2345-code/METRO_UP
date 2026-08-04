"use client";

import { forwardRef } from "react";
import { motion, type HTMLMotionProps } from "framer-motion";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { cardIn, springSoft } from "@/lib/motion";

const cardVariants = cva(
  "relative overflow-hidden rounded-3xl transition-colors",
  {
    variants: {
      variant: {
        solid: "bg-card text-card-foreground shadow-[var(--shadow-card)]",
        glass:
          "bg-[var(--glass-bg)] backdrop-blur-xl border border-[var(--glass-border)] shadow-[var(--shadow-card)]",
        outline: "bg-card border border-border",
        brand:
          "bg-brand text-brand-foreground shadow-[var(--shadow-brand)]",
        plain: "bg-transparent",
      },
      pad: {
        none: "p-0",
        sm: "p-4",
        md: "p-5",
        lg: "p-6",
      },
    },
    defaultVariants: { variant: "solid", pad: "md" },
  },
);

export interface GlassCardProps
  extends HTMLMotionProps<"div">,
    VariantProps<typeof cardVariants> {
  /** Adds an interactive press animation. */
  interactive?: boolean;
  /** Opt out of the entrance animation (e.g. inside an already-animated list). */
  animateIn?: boolean;
}

export const GlassCard = forwardRef<HTMLDivElement, GlassCardProps>(
  (
    { className, variant, pad, interactive, animateIn = true, children, ...props },
    ref,
  ) => {
    return (
      <motion.div
        ref={ref}
        variants={animateIn ? cardIn : undefined}
        whileTap={interactive ? { scale: 0.98 } : undefined}
        transition={springSoft}
        className={cn(
          cardVariants({ variant, pad }),
          interactive && "cursor-pointer active:brightness-[0.99]",
          className,
        )}
        {...props}
      >
        {children}
      </motion.div>
    );
  },
);
GlassCard.displayName = "GlassCard";

export { cardVariants };
