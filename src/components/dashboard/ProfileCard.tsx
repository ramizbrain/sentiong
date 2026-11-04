import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";

import { baseName } from "../../lib/format";
import { accentStyle } from "../../lib/profileColors";
import type { Profile } from "../../types/sentiong";
import { Avatar } from "../common/Avatar";
import { BuildingIcon, CheckIcon, FolderIcon, KeyIcon, PenIcon, SignatureIcon, TrashIcon } from "../common/Icons";
import { Spinner } from "../common/Spinner";
import { TiltCard } from "../motion/TiltCard";

interface ProfileCardProps {
  profile: Profile;
  isDefault: boolean;
  isSwitching: boolean;
  index: number;
  onActivate: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function ProfileCard({ profile, isDefault, isSwitching, index, onActivate, onEdit, onDelete }: ProfileCardProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [firstOwner, ...otherOwners] = profile.owners;

  return (
    <TiltCard
      className="profile-card"
      data-default={isDefault}
      style={accentStyle(profile.color)}
      layout
      initial={{ opacity: 0, y: 30, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9, filter: "blur(8px)", transition: { duration: 0.3 } }}
      transition={{ type: "spring", stiffness: 140, damping: 18, delay: index * 0.07 }}
    >
      {isDefault && (
        <motion.div
          layoutId="default-glow"
          className="profile-card__default-glow"
          transition={{ type: "spring", stiffness: 260, damping: 28 }}
        />
      )}

      <header className="profile-card__header">
        <Avatar login={profile.githubLogin} label={profile.label} size={48} />
        <div className="profile-card__titles">
          <h3 className="profile-card__label">{profile.label}</h3>
          <p className="profile-card__login">{profile.githubLogin ? `@${profile.githubLogin}` : "Git identity only"}</p>
        </div>
        <div className="profile-card__tools">
          <button type="button" className="icon-button" aria-label={`Edit ${profile.label}`} onClick={onEdit}>
            <PenIcon />
          </button>
          <button
            type="button"
            className="icon-button icon-button--danger"
            aria-label={`Delete ${profile.label}`}
            onClick={() => setConfirmingDelete(true)}
          >
            <TrashIcon />
          </button>
        </div>
      </header>

      <p className="profile-card__email mono">{profile.gitEmail}</p>

      <ul className="profile-card__facts">
        {profile.folders.length > 0 && (
          <li className="chip" title={profile.folders.join("\n")}>
            <FolderIcon size={12} />
            <span>{profile.folders.length === 1 ? baseName(profile.folders[0]) : `${profile.folders.length} folders`}</span>
          </li>
        )}
        {firstOwner && (
          <li className="chip" title={profile.owners.join(", ")}>
            <BuildingIcon size={12} />
            <span>
              {firstOwner}
              {otherOwners.length > 0 && ` +${otherOwners.length}`}
            </span>
          </li>
        )}
        {profile.sshKeyPath && (
          <li className="chip" title={profile.sshKeyPath}>
            <KeyIcon size={12} />
            <span>{baseName(profile.sshKeyPath)}</span>
          </li>
        )}
        {profile.signing && (
          <li className="chip chip--success">
            <SignatureIcon size={12} />
            <span>Signed</span>
          </li>
        )}
      </ul>

      <footer className="profile-card__footer">
        <AnimatePresence mode="wait" initial={false}>
          {confirmingDelete ? (
            <motion.div
              key="confirm"
              className="profile-card__confirm"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
            >
              <span>Delete this profile?</span>
              <button type="button" className="button button--small button--ghost" onClick={() => setConfirmingDelete(false)}>
                Keep
              </button>
              <button type="button" className="button button--small button--danger" onClick={onDelete}>
                Delete
              </button>
            </motion.div>
          ) : isDefault ? (
            <motion.span
              key="default"
              className="profile-card__badge"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
            >
              <CheckIcon size={14} />
              Default profile
            </motion.span>
          ) : (
            <motion.button
              key="activate"
              type="button"
              className="button button--small button--ghost profile-card__activate"
              onClick={onActivate}
              disabled={isSwitching}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              whileTap={{ scale: 0.94 }}
            >
              {isSwitching && <Spinner size={12} />}
              Make default
            </motion.button>
          )}
        </AnimatePresence>
      </footer>
    </TiltCard>
  );
}
