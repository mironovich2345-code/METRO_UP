import type { Transition, Variants } from "framer-motion";

/** Signature easing — a soft, expensive decelerate. */
export const easeOutSoft: Transition["ease"] = [0.22, 1, 0.36, 1];

export const springSoft: Transition = {
  type: "spring",
  stiffness: 380,
  damping: 32,
  mass: 0.9,
};

/** Cards rise gently into place. */
export const cardIn: Variants = {
  hidden: { opacity: 0, y: 18, filter: "blur(6px)" },
  show: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.55, ease: easeOutSoft },
  },
};

/**
 * Sprint: LIVE QA FIX QA-01B — the `initial` value a ROOT tab screen's
 * staggerStack container uses. Root screens (/home, /academy, /team, /plan,
 * /city, /questions, /knowledge, /ranking, /metric) remount on every tab
 * navigation, and framer-motion propagates a container's `initial` to every
 * `variants={cardIn}` child — including children that mount LATER (verified
 * in framer-motion 12's makeLatestValues: an inherited `initial` label is
 * applied on each child's first frame; `initial === false` blocks it and
 * starts the child at `animate`). With "hidden", every tab switch painted
 * its content at opacity 0 + blur(6px) + 18px offset and re-materialized it
 * over ~0.6-1s — even with fully cached data — which is the visible
 * "flash" on same-role navigation.
 *
 * The entrance is now the cold-open reveal ONLY: the first root screen of a
 * session plays it; every later root-screen mount gets `false` and renders
 * its content in its final state on its very first frame.
 */
export function rootScreenEntranceInitial(rootScreenAlreadyShown: boolean): "hidden" | false {
  return rootScreenAlreadyShown ? false : "hidden";
}

/** Stagger container for a vertical stack of cards. */
export const staggerStack: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.07, delayChildren: 0.04 },
  },
};

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: easeOutSoft } },
};

/** Full-screen page transition used across routes. */
export const pageTransition: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: easeOutSoft } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.25, ease: easeOutSoft } },
};

/** Press feedback shared by all tappable surfaces. */
export const tapScale = { scale: 0.96 };
export const tapScaleSubtle = { scale: 0.98 };
