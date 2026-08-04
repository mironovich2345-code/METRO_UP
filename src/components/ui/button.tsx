"use client";

import { forwardRef } from "react";
import { motion, type HTMLMotionProps } from "framer-motion";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { springSoft } from "@/lib/motion";
import { haptic } from "@/lib/telegram";

const buttonVariants = cva(
  "relative inline-flex items-center justify-center gap-2 select-none font-semibold whitespace-nowrap rounded-2xl outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary:
          "bg-brand text-brand-foreground shadow-[var(--shadow-brand)] hover:bg-brand-strong",
        secondary:
          "bg-muted text-foreground hover:bg-border",
        outline:
          "border border-border-strong bg-transparent text-foreground hover:bg-muted",
        ghost: "bg-transparent text-muted-foreground hover:text-foreground",
      },
      size: {
        sm: "h-10 px-4 text-sm",
        md: "h-12 px-5 text-[15px]",
        lg: "h-14 px-6 text-base",
        icon: "h-11 w-11",
      },
      block: { true: "w-full", false: "" },
    },
    defaultVariants: { variant: "primary", size: "lg", block: false },
  },
);

export interface ButtonProps
  extends Omit<HTMLMotionProps<"button">, "children">,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
  children?: React.ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant, size, block, loading, children, disabled, onClick, ...props },
    ref,
  ) => {
    return (
      <motion.button
        ref={ref}
        className={cn(buttonVariants({ variant, size, block }), className)}
        whileTap={{ scale: 0.96 }}
        transition={springSoft}
        disabled={disabled || loading}
        onClick={(event) => {
          haptic("light");
          onClick?.(event);
        }}
        {...props}
      >
        {loading && <Loader2 className="size-4 animate-spin" />}
        {children}
      </motion.button>
    );
  },
);
Button.displayName = "Button";

/** Convenience wrappers matching the design-system naming. */
export const PrimaryButton = forwardRef<HTMLButtonElement, ButtonProps>(
  (props, ref) => <Button ref={ref} variant="primary" {...props} />,
);
PrimaryButton.displayName = "PrimaryButton";

export const SecondaryButton = forwardRef<HTMLButtonElement, ButtonProps>(
  (props, ref) => <Button ref={ref} variant="secondary" {...props} />,
);
SecondaryButton.displayName = "SecondaryButton";

export { buttonVariants };
