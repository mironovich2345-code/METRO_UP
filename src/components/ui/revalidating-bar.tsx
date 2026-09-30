"use client";

import { motion, AnimatePresence } from "framer-motion";

/**
 * Sprint: mini-app-performance, section 13 — the "subtle refreshing state"
 * every migrated screen shows instead of replacing already-rendered cached
 * content with a blank skeleton: a thin brand-colored bar just under the
 * header, visible only while a background revalidation is in flight AND
 * there is already cached data on screen (a cold, empty-cache load still
 * uses the screen's own full skeleton — this bar is for the OTHER case).
 * Respects prefers-reduced-motion via framer-motion's own opacity-only
 * fallback (no layout-affecting animation).
 */
export function RevalidatingBar({ show }: { show: boolean }) {
  return (
    <div className="h-0.5 w-full overflow-hidden">
      <AnimatePresence>
        {show && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="h-full w-full bg-brand/60"
          />
        )}
      </AnimatePresence>
    </div>
  );
}
