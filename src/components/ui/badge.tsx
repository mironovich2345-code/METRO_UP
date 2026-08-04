import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full font-semibold leading-none",
  {
    variants: {
      variant: {
        brand: "bg-brand-soft text-brand-foreground dark:text-brand",
        neutral: "bg-muted text-muted-foreground",
        success: "bg-success-soft text-success",
        outline: "border border-border text-muted-foreground",
        solid: "bg-foreground text-background",
      },
      size: {
        sm: "px-2 py-1 text-[11px]",
        md: "px-2.5 py-1.5 text-xs",
      },
    },
    defaultVariants: { variant: "neutral", size: "sm" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, size, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant, size }), className)} {...props} />
  );
}
