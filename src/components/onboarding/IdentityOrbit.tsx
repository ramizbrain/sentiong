import { motion } from "motion/react";

import { accentStyle, COLOR_KEYS } from "../../lib/profileColors";
import type { GhAccount } from "../../types/sentiong";
import { BrandMark } from "../brand/BrandMark";
import { Avatar } from "../common/Avatar";

interface IdentityOrbitProps {
  accounts: GhAccount[];
}

const RADIUS = 128;

/**
 * The brand mark at the center with the accounts gh already knows circling it:
 * "these are the identities Sentiong will keep apart".
 */
export function IdentityOrbit({ accounts }: IdentityOrbitProps) {
  const satellites = accounts.length > 0 ? accounts.slice(0, 5) : [null, null, null];

  return (
    <div className="orbit" aria-hidden="true">
      <div className="orbit__ring orbit__ring--outer" />
      <div className="orbit__ring orbit__ring--inner" />
      <motion.div
        className="orbit__core"
        initial={{ scale: 0.4, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 90, damping: 14, delay: 0.1 }}
      >
        <BrandMark size={86} animated />
      </motion.div>

      <motion.div
        className="orbit__track"
        animate={{ rotate: 360 }}
        transition={{ duration: 46, repeat: Infinity, ease: "linear" }}
      >
        {satellites.map((account, index) => {
          const angle = (index / satellites.length) * Math.PI * 2 - Math.PI / 2;
          const color = COLOR_KEYS[index % COLOR_KEYS.length];
          return (
            <motion.div
              key={account?.login ?? index}
              className="orbit__satellite"
              style={{ x: Math.cos(angle) * RADIUS, y: Math.sin(angle) * RADIUS, ...accentStyle(color) }}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 160, damping: 14, delay: 0.7 + index * 0.12 }}
            >
              {/* Counter-rotate so avatars stay upright while the track turns. */}
              <motion.div animate={{ rotate: -360 }} transition={{ duration: 46, repeat: Infinity, ease: "linear" }}>
                {account ? (
                  <Avatar login={account.login} label={account.login} size={46} />
                ) : (
                  <span className="orbit__placeholder" />
                )}
              </motion.div>
            </motion.div>
          );
        })}
      </motion.div>
    </div>
  );
}
