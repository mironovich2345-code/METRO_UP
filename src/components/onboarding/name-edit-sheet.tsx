"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { isValidDisplayName } from "@/lib/profile";
import { springSoft } from "@/lib/motion";

interface NameEditSheetProps {
  open: boolean;
  initialName: string;
  onSave: (name: string) => void;
  onClose: () => void;
}

/**
 * Bottom sheet to edit the METRO_UP display name. Only the local displayName
 * changes — the Telegram profile is never touched.
 */
export function NameEditSheet({
  open,
  initialName,
  onSave,
  onClose,
}: NameEditSheetProps) {
  const [value, setValue] = useState(initialName);

  useEffect(() => {
    if (open) setValue(initialName);
  }, [open, initialName]);

  const trimmed = value.trim();
  const valid = isValidDisplayName(trimmed);

  const handleSave = () => {
    if (!valid) return;
    onSave(trimmed);
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50">
          <motion.div
            className="absolute inset-0 bg-black/45"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="absolute inset-x-0 bottom-0 rounded-t-3xl border-t border-border bg-card p-6 pb-[calc(env(safe-area-inset-bottom)+24px)]"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={springSoft}
          >
            <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-border" />
            <h2 className="text-xl font-extrabold tracking-tight text-foreground">
              Как к тебе обращаться?
            </h2>

            <input
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
              maxLength={50}
              className="mt-4 w-full rounded-2xl border-2 border-border bg-background px-4 py-3.5 text-[15px] font-semibold text-foreground outline-none transition-colors focus:border-brand"
              placeholder="Твоё имя"
            />
            <p className="mt-2 h-4 text-xs font-medium text-muted-foreground">
              {trimmed.length > 0 && trimmed.length < 2
                ? "Минимум 2 символа"
                : ""}
            </p>

            <div className="mt-4 flex gap-3">
              <Button variant="secondary" size="md" block onClick={onClose}>
                Отмена
              </Button>
              <Button size="md" block disabled={!valid} onClick={handleSave}>
                Сохранить
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
