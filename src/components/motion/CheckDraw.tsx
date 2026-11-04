import { motion } from "motion/react";

/** A check mark in a circle that draws itself in. */
export function CheckDraw({ size = 22, delay = 0 }: { size?: number; delay?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className="check-draw" aria-hidden="true">
      <motion.circle
        cx="12"
        cy="12"
        r="10"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 0.45, delay, ease: "easeOut" }}
      />
      <motion.path
        d="m7.5 12.5 3 3 6-6.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.35, delay: delay + 0.3, ease: "easeOut" }}
      />
    </svg>
  );
}
