import { motion, useMotionTemplate, useMotionValue, useSpring, useTransform } from "motion/react";
import type { HTMLMotionProps } from "motion/react";
import type { PointerEvent } from "react";

type TiltCardProps = HTMLMotionProps<"div"> & {
  /** Maximum tilt in degrees. */
  intensity?: number;
};

/**
 * A card that leans towards the pointer, with a soft glare that follows it.
 * The glare reads `--glare-x` / `--glare-y` (see `.tilt-card::after`).
 */
export function TiltCard({ intensity = 6, className = "", children, style, ...props }: TiltCardProps) {
  const pointerX = useMotionValue(0.5);
  const pointerY = useMotionValue(0.5);
  const springConfig = { stiffness: 220, damping: 22, mass: 0.6 };
  const rotateX = useSpring(useTransform(pointerY, [0, 1], [intensity, -intensity]), springConfig);
  const rotateY = useSpring(useTransform(pointerX, [0, 1], [-intensity, intensity]), springConfig);
  const glareX = useTransform(pointerX, (value) => `${value * 100}%`);
  const glareY = useTransform(pointerY, (value) => `${value * 100}%`);
  const glare = useMotionTemplate`${glareX} ${glareY}`;

  const track = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    pointerX.set((event.clientX - bounds.left) / bounds.width);
    pointerY.set((event.clientY - bounds.top) / bounds.height);
  };
  const reset = () => {
    pointerX.set(0.5);
    pointerY.set(0.5);
  };

  return (
    <motion.div
      className={`tilt-card ${className}`}
      onPointerMove={track}
      onPointerLeave={reset}
      style={{ rotateX, rotateY, transformPerspective: 900, ["--glare" as string]: glare, ...style }}
      {...props}
    >
      {children}
    </motion.div>
  );
}
