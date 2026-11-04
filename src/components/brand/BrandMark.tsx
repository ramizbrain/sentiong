/**
 * Sentiong's mark: two halves, one for work and one for life, that lock together around a
 * single core. Every screen uses these two components, and the path data lives in
 * `logoPaths.ts`.
 */
import { motion, type Transition } from "motion/react";
import { BRAND_BLUE, LOGO_ASPECT, LOGO_VIEWBOX, MARK_PATHS, MARK_VIEWBOX, WORDMARK_PATH } from "./logoPaths";

interface BrandMarkProps {
  size?: number;
  /** Slides the two halves in from opposite corners, then drops the core into place. */
  animated?: boolean;
  className?: string;
}

const halfSpring = (delay: number): Transition => ({ type: "spring", stiffness: 140, damping: 16, delay });

function MarkPaths({ animated }: { animated: boolean }) {
  if (!animated) {
    return (
      <>
        <path fill={BRAND_BLUE} d={MARK_PATHS.left} />
        <path fill="currentColor" d={MARK_PATHS.right} />
        <path fill="currentColor" d={MARK_PATHS.core} />
      </>
    );
  }
  return (
    <>
      <motion.path
        fill={BRAND_BLUE}
        d={MARK_PATHS.left}
        initial={{ x: -46, y: -24, opacity: 0 }}
        animate={{ x: 0, y: 0, opacity: 1 }}
        transition={halfSpring(0)}
      />
      <motion.path
        fill="currentColor"
        d={MARK_PATHS.right}
        initial={{ x: 46, y: 24, opacity: 0 }}
        animate={{ x: 0, y: 0, opacity: 1 }}
        transition={halfSpring(0.12)}
      />
      <motion.path
        fill="currentColor"
        d={MARK_PATHS.core}
        style={{ transformBox: "fill-box", transformOrigin: "center" }}
        initial={{ scale: 0, rotate: -90, opacity: 0 }}
        animate={{ scale: 1, rotate: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 14, delay: 0.45 }}
      />
    </>
  );
}

export function BrandMark({ size = 32, animated = false, className = "" }: BrandMarkProps) {
  return (
    <svg viewBox={MARK_VIEWBOX} width={size} height={size} className={`brand-mark ${className}`} aria-hidden="true">
      <MarkPaths animated={animated} />
    </svg>
  );
}

/** The full lockup, mark and wordmark, at the given height. */
export function BrandLogo({ height = 26, className = "" }: { height?: number; className?: string }) {
  return (
    <svg
      viewBox={LOGO_VIEWBOX}
      height={height}
      width={height * LOGO_ASPECT}
      className={`brand-logo ${className}`}
      role="img"
      aria-label="Sentiong"
    >
      <MarkPaths animated={false} />
      <path fill="currentColor" fillRule="evenodd" d={WORDMARK_PATH} />
    </svg>
  );
}
