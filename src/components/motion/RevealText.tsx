import { motion } from "motion/react";
import type { Variants } from "motion/react";
import type { ReactNode } from "react";

interface RevealTextProps {
  /** Plain words, revealed one after another. */
  text: string;
  /** Words (by index) to wrap, for example in a gradient. */
  highlight?: (word: string, index: number) => ReactNode | null;
  className?: string;
  delay?: number;
}

const container = (delay: number): Variants => ({
  hidden: {},
  shown: { transition: { staggerChildren: 0.06, delayChildren: delay } },
});

const word: Variants = {
  hidden: { opacity: 0, y: "0.55em", filter: "blur(10px)", rotateX: -40 },
  shown: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    rotateX: 0,
    transition: { type: "spring", stiffness: 120, damping: 16 },
  },
};

/** A heading whose words rise into place one at a time. */
export function RevealText({ text, highlight, className = "", delay = 0 }: RevealTextProps) {
  const words = text.split(" ");
  return (
    <motion.h1 className={`reveal-text ${className}`} aria-label={text} variants={container(delay)} initial="hidden" animate="shown">
      {words.map((value, index) => (
        <motion.span key={index} className="reveal-text__word" variants={word} aria-hidden="true">
          {highlight?.(value, index) ?? value}
        </motion.span>
      ))}
    </motion.h1>
  );
}
