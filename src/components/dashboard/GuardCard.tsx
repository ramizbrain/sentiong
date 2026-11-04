import { motion } from "motion/react";

import type { GuardStatus } from "../../types/sentiong";
import { ShieldIcon, WarningIcon } from "../common/Icons";
import { Toggle } from "../common/Toggle";

interface GuardCardProps {
  guard: GuardStatus;
  onToggle: (enabled: boolean) => void;
}

export function GuardCard({ guard, onToggle }: GuardCardProps) {
  const blocked = guard.conflict !== null && !guard.enabled;
  return (
    <motion.section
      className="guard-card panel"
      data-on={guard.enabled}
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ type: "spring", stiffness: 120, damping: 18, delay: 0.2 }}
    >
      <div className="guard-card__visual" aria-hidden="true">
        <span className="guard-card__sonar" />
        <span className="guard-card__sonar guard-card__sonar--late" />
        <motion.span
          className="guard-card__shield"
          animate={guard.enabled ? { scale: [1, 1.08, 1] } : { scale: 1 }}
          transition={{ duration: 2.4, repeat: guard.enabled ? Infinity : 0, ease: "easeInOut" }}
        >
          <ShieldIcon size={30} />
        </motion.span>
      </div>

      <div className="guard-card__header">
        <h2>Wrong-account guard</h2>
        <Toggle checked={guard.enabled} onChange={onToggle} label="Wrong-account guard" disabled={blocked} />
      </div>
      <p className="guard-card__text">
        Stops a commit when a repository's organization belongs to another profile than the one it would commit
        as. Your repositories' own hooks keep running.
      </p>
      {guard.conflict ? (
        <p className="guard-card__note guard-card__note--warning">
          <WarningIcon size={14} />
          <span>
            Your Git config already sets <code>core.hooksPath</code> to <code>{guard.conflict}</code>. Remove it to
            use the guard.
          </span>
        </p>
      ) : (
        <p className="guard-card__note">
          <span>
            Need to commit anyway? Prefix the command with <code>SENTIONG_SKIP=1</code>.
          </span>
        </p>
      )}
    </motion.section>
  );
}
