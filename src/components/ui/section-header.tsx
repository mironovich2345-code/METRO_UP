"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface SectionHeaderProps {
  title: string;
  action?: { label: string; href: string };
  className?: string;
}

export function SectionHeader({ title, action, className }: SectionHeaderProps) {
  return (
    <div className={cn("flex items-center justify-between px-1", className)}>
      <h2 className="text-[17px] font-bold tracking-tight text-foreground">
        {title}
      </h2>
      {action && (
        <Link
          href={action.href}
          className="flex items-center gap-0.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          {action.label}
          <ChevronRight className="size-4" />
        </Link>
      )}
    </div>
  );
}
