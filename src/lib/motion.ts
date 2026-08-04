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
