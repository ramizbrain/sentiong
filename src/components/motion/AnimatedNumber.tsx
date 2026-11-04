import { motion, useSpring, useTransform } from "motion/react";
import { useEffect } from "react";

interface AnimatedNumberProps {
  value: number;
  className?: string;
}

/** Counts smoothly towards `value`, starting from zero on first render. */
export function AnimatedNumber({ value, className }: AnimatedNumberProps) {
  // Close to critical damping: no overshoot, and no long crawl at the end.
  const spring = useSpring(0, { stiffness: 120, damping: 20, mass: 0.7, restDelta: 0.5 });
  const text = useTransform(spring, (current) => Math.max(0, Math.round(current)).toLocaleString("en-US"));

  useEffect(() => {
    spring.set(value);
  }, [spring, value]);

  return <motion.span className={className}>{text}</motion.span>;
}
