"use client";

import { useId } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, X } from "lucide-react";
import { springSoft } from "@/lib/motion";
import { cn } from "@/lib/utils";

export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

/**
 * Sprint: LIVE QA QA-04, section B — a compact single-choice field: one
 * full-width row showing the current choice with a ▾, opening a bottom sheet
 * list. Picking an option reports it and closes the sheet; it never submits
 * anything. The sheet is portaled to <body> so a transformed ancestor (the
 * screens' framer-motion stagger) can never trap its `position: fixed`.
 */
export function SelectField<T extends string>({
  label,
  value,
  options,
  open,
  onOpenChange,
  onChange,
  placeholder = "—",
}: {
  label: string;
  /** null = nothing chosen yet; the field shows `placeholder`. */
  value: T | null;
  placeholder?: string;
  options: readonly SelectOption<T>[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (value: T) => void;
}) {
  const id = useId();
  const current = options.find((o) => o.value === value);
  return (
    <>
      <button
        type="button"
        id={id}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${label}: ${current?.label ?? placeholder}`}
        onClick={() => onOpenChange(true)}
        className="flex min-h-12 w-full min-w-0 items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-left transition-colors active:bg-foreground/5"
      >
        <span className={cn("min-w-0 flex-1 truncate text-[15px] font-medium", current ? "text-foreground" : "text-muted-foreground")}>
          {current?.label ?? placeholder}
        </span>
        <ChevronDown className="size-4.5 shrink-0 text-muted-foreground" aria-hidden />
      </button>
      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {open && (
              <div key="option-sheet" className="fixed inset-0 z-50">
                <motion.div
                  className="absolute inset-0 bg-black/45"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => onOpenChange(false)}
                />
                <motion.div
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby={`${id}-title`}
                  className="absolute inset-x-0 bottom-0 max-h-[80dvh] overflow-y-auto rounded-t-3xl border-t border-border bg-card px-4 pt-4 pb-[calc(env(safe-area-inset-bottom)+16px)]"
                  initial={{ y: "100%" }}
                  animate={{ y: 0 }}
                  exit={{ y: "100%" }}
                  transition={springSoft}
                >
                  <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border" />
                  <div className="flex items-center justify-between gap-3 px-2">
                    <h2 id={`${id}-title`} className="text-lg font-bold text-foreground">
                      {label}
                    </h2>
                    <button
                      type="button"
                      onClick={() => onOpenChange(false)}
                      className="flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground active:bg-foreground/5"
                      aria-label="Закрыть"
                    >
                      <X className="size-5" />
                    </button>
                  </div>
                  <ul role="listbox" aria-labelledby={`${id}-title`} className="mt-1 flex flex-col">
                    {options.map((option) => {
                      const selected = option.value === value;
                      return (
                        <li key={option.value} role="option" aria-selected={selected}>
                          <button
                            type="button"
                            onClick={() => {
                              onChange(option.value);
                              onOpenChange(false);
                            }}
                            className={cn(
                              "flex min-h-12 w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-[15px] transition-colors active:bg-foreground/5",
                              selected ? "font-semibold text-foreground" : "text-foreground",
                            )}
                          >
                            <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{option.label}</span>
                            {selected && <Check className="size-4.5 shrink-0 text-brand" aria-hidden />}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </motion.div>
              </div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}
