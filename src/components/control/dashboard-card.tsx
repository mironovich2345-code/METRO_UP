import Link from "next/link";
import { ArrowRight, type LucideIcon } from "lucide-react";

/** Shared PROJECT_ADMIN Home card chrome (QA-06 cards + QA-07 telemetry). */
export function DashboardCard({
  icon: Icon,
  title,
  children,
  footer,
}: {
  icon: LucideIcon;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <section className="flex min-w-0 flex-col rounded-3xl border border-border bg-card p-5">
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-brand/12">
          <Icon className="size-5 text-brand" aria-hidden />
        </span>
        <h2 className="min-w-0 text-lg font-bold [overflow-wrap:anywhere]">{title}</h2>
      </div>
      <div className="mt-4 flex-1">{children}</div>
      {footer && <div className="mt-3">{footer}</div>}
    </section>
  );
}

export function DashboardMoreLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-brand hover:underline">
      {children} <ArrowRight className="size-4" aria-hidden />
    </Link>
  );
}

export function DashboardStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-2xl font-bold tabular-nums [overflow-wrap:anywhere]">{value}</p>
      <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">{label}</p>
    </div>
  );
}
