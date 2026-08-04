import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  /** Force a palette; defaults to inheriting current theme colors. */
  tone?: "auto" | "onDark" | "onLight";
  size?: "sm" | "md" | "lg";
}

const sizes = {
  sm: "text-xl",
  md: "text-3xl",
  lg: "text-[42px]",
} as const;

/** MetroFitness wordmark — METRO with a yellow accent bar + FITNESS kicker. */
export function Logo({ className, tone = "auto", size = "md" }: LogoProps) {
  const wordColor =
    tone === "onDark"
      ? "text-white"
      : tone === "onLight"
        ? "text-[#0a0a0a]"
        : "text-foreground";

  const kickerColor =
    tone === "onDark"
      ? "text-white/50"
      : tone === "onLight"
        ? "text-black/50"
        : "text-muted-foreground";

  return (
    <div className={cn("flex flex-col items-center", className)}>
      <div className="flex items-end">
        <span
          className={cn(
            "font-extrabold uppercase leading-none tracking-tight",
            sizes[size],
            wordColor,
          )}
        >
          Metro
        </span>
        <span
          className="mb-1 ml-1 inline-block size-2 rounded-full bg-brand"
          aria-hidden
        />
      </div>
      <span
        className={cn(
          "mt-1.5 text-[10px] font-bold uppercase tracking-[0.42em]",
          kickerColor,
        )}
      >
        Fitness
      </span>
    </div>
  );
}
