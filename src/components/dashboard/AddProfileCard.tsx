import { motion } from "motion/react";

import { PlusIcon } from "../common/Icons";

export function AddProfileCard({ onClick, index }: { onClick: () => void; index: number }) {
  return (
    <motion.button
      type="button"
      className="add-profile-card"
      onClick={onClick}
      layout
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 140, damping: 18, delay: index * 0.07 }}
      whileHover={{ y: -4 }}
      whileTap={{ scale: 0.97 }}
    >
      <motion.span className="add-profile-card__icon" whileHover={{ rotate: 90 }}>
        <PlusIcon size={22} />
      </motion.span>
      <span className="add-profile-card__title">Add a profile</span>
      <span className="add-profile-card__hint">Another account, client, or side project</span>
    </motion.button>
  );
}
