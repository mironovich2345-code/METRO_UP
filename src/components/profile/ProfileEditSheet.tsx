"use client";

import { useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { springSoft } from "@/lib/motion";
import { cn } from "@/lib/utils";
import {
  DISPLAY_NAME_MAX_LENGTH,
  canSubmitProfileName,
  describeProfileSaveError,
  isProfileNameDirty,
  splitDisplayName,
  validateProfileName,
  type ProfileNameField,
  type ProfileNameFieldErrors,
  type ProfileNameParts,
} from "@/lib/profile-edit";

interface ProfileEditSheetProps {
  open: boolean;
  /** The CONFIRMED stored name (AppUser.displayName) the form starts from. */
  displayName: string;
  onClose: () => void;
  /** Persists the change. Resolves only once the server has confirmed it;
   * throws on any failure (the form then stays open with the values kept). */
  onSave: (parts: ProfileNameParts) => Promise<unknown>;
}

/**
 * Sprint: LIVE QA QA-02 — "Редактировать профиль". Same bottom-sheet shell
 * as the app's other sheets (AvatarCropSheet, onboarding's NameEditSheet).
 *
 * The form is its own component mounted only while the sheet is open, so
 * every open starts from the confirmed name and Cancel / X / tapping outside
 * discards edits by construction — no reset bookkeeping. Close is ignored
 * while a save is in flight, so a request can never finish against a
 * dismissed editor.
 */
export function ProfileEditSheet({ open, displayName, onClose, onSave }: ProfileEditSheetProps) {
  return (
    <AnimatePresence>
      {open && <ProfileEditPanel key="profile-edit" displayName={displayName} onClose={onClose} onSave={onSave} />}
    </AnimatePresence>
  );
}

function ProfileEditPanel({ displayName, onClose, onSave }: Omit<ProfileEditSheetProps, "open">) {
  // Captured once, at open: the dirty-check baseline and the initial values.
  const [initialDisplayName] = useState(displayName);
  const [values, setValues] = useState<ProfileNameParts>(() => splitDisplayName(displayName));
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<ProfileNameFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  // Blocks a second submit fired in the same tick, before `saving` re-renders.
  const inFlight = useRef(false);
  const lastNameRef = useRef<HTMLInputElement>(null);
  const firstNameId = useId();
  const lastNameId = useId();

  const dirty = isProfileNameDirty(initialDisplayName, values);

  const requestClose = () => {
    if (!inFlight.current) onClose();
  };

  const updateField = (field: ProfileNameField, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => (current[field] ? { ...current, [field]: undefined } : current));
    setFormError(null);
  };

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (inFlight.current) return;
    const validation = validateProfileName(values);
    if (!validation.ok) {
      setFieldErrors(validation.fields);
      return;
    }
    if (!canSubmitProfileName({ initialDisplayName, current: values, saving: false })) return;

    inFlight.current = true;
    setSaving(true);
    setFormError(null);
    try {
      await onSave(values);
      inFlight.current = false;
      onClose();
    } catch (error) {
      const failure = describeProfileSaveError(error);
      setFieldErrors(failure.fields ?? {});
      setFormError(failure.message);
      inFlight.current = false;
      setSaving(false);
    }
  };

  const onFirstNameKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      lastNameRef.current?.focus();
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
        aria-labelledby={`${firstNameId}-title`}
        className="absolute inset-x-0 bottom-0 max-h-[90dvh] overflow-y-auto rounded-t-3xl border-t border-border bg-card p-6 pb-[calc(env(safe-area-inset-bottom)+24px)]"
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={springSoft}
      >
        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-border" />
        <div className="flex items-center justify-between gap-3">
          <h2 id={`${firstNameId}-title`} className="text-lg font-bold text-foreground">
            Редактировать профиль
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
        <p className="mt-1 text-sm text-muted-foreground">Имя и фамилию видят коллеги и руководители.</p>

        <form noValidate onSubmit={submit} className="mt-5 flex flex-col gap-4">
          <NameField
            id={firstNameId}
            label="Имя"
            value={values.firstName}
            error={fieldErrors.firstName}
            autoComplete="given-name"
            enterKeyHint="next"
            disabled={saving}
            onChange={(value) => updateField("firstName", value)}
            onKeyDown={onFirstNameKeyDown}
          />
          <NameField
            id={lastNameId}
            label="Фамилия"
            value={values.lastName}
            error={fieldErrors.lastName}
            autoComplete="family-name"
            enterKeyHint="done"
            disabled={saving}
            inputRef={lastNameRef}
            onChange={(value) => updateField("lastName", value)}
          />

          {formError && (
            <p role="alert" className="text-sm text-red-500">
              {formError}
            </p>
          )}

          {/* px-3 (not the default px-5) keeps «Сохранение…» inside its button
              at 320px, where each of the two buttons is ~130px wide. */}
          <div className="mt-1 flex gap-3">
            <Button type="button" variant="secondary" size="md" block className="px-3" onClick={requestClose} disabled={saving}>
              Отмена
            </Button>
            <Button type="submit" size="md" block className="px-3" disabled={saving || !dirty}>
              {saving ? "Сохранение…" : "Сохранить"}
            </Button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

function NameField({
  id,
  label,
  value,
  error,
  autoComplete,
  enterKeyHint,
  disabled,
  inputRef,
  onChange,
  onKeyDown,
}: {
  id: string;
  label: string;
  value: string;
  error?: string;
  autoComplete: "given-name" | "family-name";
  enterKeyHint: "next" | "done";
  disabled: boolean;
  inputRef?: React.Ref<HTMLInputElement>;
  onChange: (value: string) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
}) {
  const errorId = `${id}-error`;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="px-1 text-sm font-semibold text-foreground">
        {label}
      </label>
      <input
        ref={inputRef}
        id={id}
        name={autoComplete}
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        autoComplete={autoComplete}
        autoCapitalize="words"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint={enterKeyHint}
        maxLength={DISPLAY_NAME_MAX_LENGTH}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={cn(
          "w-full min-w-0 rounded-2xl border-2 bg-background px-4 py-3 text-base font-semibold text-foreground outline-none transition-colors focus:border-brand disabled:opacity-60",
          error ? "border-red-500" : "border-border",
        )}
      />
      {error && (
        <p id={errorId} className="px-1 text-xs font-medium text-red-500">
          {error}
        </p>
      )}
    </div>
  );
}
