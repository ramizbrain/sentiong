import { motion } from "motion/react";

interface BurstProps {
  /** Change this to replay the burst. */
  burstKey: string | number;
  count?: number;
  radius?: number;
}

/** Particles flying out from the center in the surrounding accent color. */
export function Burst({ burstKey, count = 14, radius = 140 }: BurstProps) {
  return (
    <div className="burst" key={burstKey} aria-hidden="true">
      {Array.from({ length: count }, (_, index) => {
        const angle = (index / count) * Math.PI * 2 + (index % 2) * 0.25;
        const distance = radius * (0.55 + (index % 3) * 0.22);
        return (
          <motion.span
            key={index}
            className={`burst__particle burst__particle--${index % 3}`}
            initial={{ x: 0, y: 0, scale: 0, opacity: 1 }}
            animate={{
              x: Math.cos(angle) * distance,
              y: Math.sin(angle) * distance,
              scale: [0, 1.2, 0],
              opacity: [1, 1, 0],
              rotate: 120,
            }}
            transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1], delay: (index % 4) * 0.035 }}
          />
        );
      })}
    </div>
  );
}
