"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { springSoft } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { describeProfileSaveError } from "@/lib/profile-edit";
import {
  EMPLOYMENT_DATE_MESSAGES,
  METROFITNESS_NETWORK_STARTED_ON,
  employmentDateInputValue,
  localTodayInputValue,
  parseEmploymentStartDate,
} from "@/lib/employment-date";

interface EmploymentStartSheetProps {
  open: boolean;
  /** The CONFIRMED stored start date (ISO instant) or null when none is set. */
  startedAtIso: string | null;
  onClose: () => void;
  /** Persists "YYYY-MM-DD". Resolves once the server confirmed it; throws on
   * any failure (the sheet then stays open with the value kept). */
  onSave: (startedOn: string) => Promise<unknown>;
}

/**
 * Sprint: LIVE QA QA-04, section A — "Дата начала работы". The same bottom
 * sheet shell as ProfileEditSheet; the field itself is the platform's native
 * date picker (`<input type="date">` — the wheel picker on iOS), capped at
 * the viewer's local today. Mounted only while open, so every open starts
 * from the confirmed date and Отмена discards by construction.
 */
export function EmploymentStartSheet({ open, startedAtIso, onClose, onSave }: EmploymentStartSheetProps) {
  return (
    <AnimatePresence>
      {open && <EmploymentStartPanel key="employment-start" startedAtIso={startedAtIso} onClose={onClose} onSave={onSave} />}
    </AnimatePresence>
  );
}

/** A failed save -> the sheet's message. Date-rule codes from the server get
 * their exact wording; everything else reuses the Profile editor's mapping. */
export function describeEmploymentSaveError(error: unknown): string {
  const code = typeof error === "object" && error !== null ? (error as { code?: unknown }).code : null;
  if (typeof code === "string" && code in EMPLOYMENT_DATE_MESSAGES) {
    return EMPLOYMENT_DATE_MESSAGES[code as keyof typeof EMPLOYMENT_DATE_MESSAGES];
  }
  return describeProfileSaveError(error).message;
}

function EmploymentStartPanel({ startedAtIso, onClose, onSave }: Omit<EmploymentStartSheetProps, "open">) {
  const [initial] = useState(() => employmentDateInputValue(startedAtIso));
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const id = useId();
  const today = localTodayInputValue();

  const requestClose = () => {
    if (!inFlight.current) onClose();
  };

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (inFlight.current) return;
    const parsed = parseEmploymentStartDate(value);
    if (!parsed.ok) {
      setError(parsed.message);
      return;
    }
    // The picker's max is the LOCAL today; the server check is deliberately
    // more tolerant (any timezone's today), so this is the stricter guard.
    if (parsed.isoDate > today) {
      setError(EMPLOYMENT_DATE_MESSAGES.future_date);
      return;
    }
    if (parsed.isoDate === initial) {
      onClose();
      return;
    }
    inFlight.current = true;
    setSaving(true);
    setError(null);
    try {
      await onSave(parsed.isoDate);
      inFlight.current = false;
      onClose();
    } catch (e) {
      setError(describeEmploymentSaveError(e));
      inFlight.current = false;
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50">
      <motion.div
        className="absolute inset-0 bg-black/45"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={requestClose}
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        className="absolute inset-x-0 bottom-0 max-h-[90dvh] overflow-y-auto rounded-t-3xl border-t border-border bg-card p-6 pb-[calc(env(safe-area-inset-bottom)+24px)]"
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={springSoft}
      >
        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-border" />
        <div className="flex items-center justify-between gap-3">
          <h2 id={`${id}-title`} className="text-lg font-bold text-foreground">
            Дата начала работы
          </h2>
          <button
            type="button"
            onClick={requestClose}
            disabled={saving}
            className="flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground active:bg-foreground/5 disabled:opacity-50"
            aria-label="Закрыть"
          >
            <X className="size-5" />
          </button>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">Стаж рассчитывается автоматически от этой даты.</p>

        <form noValidate onSubmit={submit} className="mt-5 flex flex-col gap-4">
          <div className="flex min-w-0 flex-col gap-1.5">
            <label htmlFor={id} className="px-1 text-sm font-semibold text-foreground">
              Дата
            </label>
            <input
              id={id}
              type="date"
              value={value}
              min={METROFITNESS_NETWORK_STARTED_ON}
              max={today}
              onChange={(event) => {
                setValue(event.target.value);
                setError(null);
              }}
              disabled={saving}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${id}-error` : undefined}
              className={cn(
                "block min-h-12 w-full min-w-0 appearance-none rounded-2xl border-2 bg-background px-4 py-3 text-base font-semibold text-foreground outline-none transition-colors focus:border-brand disabled:opacity-60",
                error ? "border-red-500" : "border-border",
              )}
            />
            {error && (
              <p id={`${id}-error`} role="alert" className="px-1 text-xs font-medium text-red-500">
                {error}
              </p>
            )}
          </div>

          <div className="mt-1 flex gap-3">
            <Button type="button" variant="secondary" size="md" block className="px-3" onClick={requestClose} disabled={saving}>
              Отмена
            </Button>
            <Button type="submit" size="md" block className="px-3" disabled={saving || !value || value === initial}>
              {saving ? "Сохранение…" : "Сохранить"}
            </Button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
