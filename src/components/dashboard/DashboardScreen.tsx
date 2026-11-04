import { AnimatePresence, motion } from "motion/react";

import type { Profile, Snapshot } from "../../types/sentiong";
import { BrandLogo } from "../brand/BrandMark";
import { RepoIcon, WarningIcon } from "../common/Icons";
import { ActiveHero } from "./ActiveHero";
import { AddProfileCard } from "./AddProfileCard";
import { ConnectionMenu } from "./ConnectionMenu";
import { GuardCard } from "./GuardCard";
import { ProfileCard } from "./ProfileCard";

interface DashboardScreenProps {
  snapshot: Snapshot;
  switchingId: string | null;
  switchCount: number;
  ownerRulesSupported: boolean;
  onNewProfile: () => void;
  onEditProfile: (profile: Profile) => void;
  onDeleteProfile: (profile: Profile) => void;
  onActivate: (profile: Profile) => void;
  onToggleGuard: (enabled: boolean) => void;
  onToggleConnected: (connected: boolean) => void;
  onOpenRepos: () => void;
}

export function DashboardScreen({
  snapshot,
  switchingId,
  switchCount,
  ownerRulesSupported,
  onNewProfile,
  onEditProfile,
  onDeleteProfile,
  onActivate,
  onToggleGuard,
  onToggleConnected,
  onOpenRepos,
}: DashboardScreenProps) {
  const active = snapshot.profiles.find((profile) => profile.id === snapshot.activeProfileId) ?? null;

  return (
    <motion.main
      className="screen dashboard"
      initial={{ opacity: 0, scale: 0.98, filter: "blur(10px)" }}
      animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
      exit={{ opacity: 0, scale: 0.98, filter: "blur(10px)", transition: { duration: 0.35 } }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* The header doubles as the window's drag handle; its buttons stay clickable. */}
      <header className="dashboard__header" data-tauri-drag-region>
        <BrandLogo />
        <div className="dashboard__header-actions">
          <motion.button
            type="button"
            className="button button--ghost button--small"
            onClick={onOpenRepos}
            whileTap={{ scale: 0.95 }}
          >
            <RepoIcon size={14} />
            Check repositories
          </motion.button>
          <ConnectionMenu connected={snapshot.connected} onChange={onToggleConnected} />
        </div>
      </header>

      <div className="dashboard__body">
        <ActiveHero profile={active} switchCount={switchCount} />

        {!snapshot.connected && (
          <motion.p className="dashboard__banner" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
            <WarningIcon size={14} />
            Sentiong is disconnected, so Git is not using these profiles. Reconnect from the menu at the top right.
          </motion.p>
        )}
        {!ownerRulesSupported && (
          <p className="dashboard__banner">
            <WarningIcon size={14} />
            Your Git is older than 2.36, so organization rules only feed the guard. Folder rules work as usual.
          </p>
        )}

        <div className="dashboard__columns">
          <section className="dashboard__profiles">
            <h2 className="section-title">Profiles</h2>
            <div className="profile-grid">
              <AnimatePresence mode="popLayout">
                {snapshot.profiles.map((profile, index) => (
                  <ProfileCard
                    key={profile.id}
                    index={index}
                    profile={profile}
                    isDefault={profile.id === snapshot.activeProfileId}
                    isSwitching={switchingId === profile.id}
                    onActivate={() => onActivate(profile)}
                    onEdit={() => onEditProfile(profile)}
                    onDelete={() => onDeleteProfile(profile)}
                  />
                ))}
                <AddProfileCard key="add" index={snapshot.profiles.length} onClick={onNewProfile} />
              </AnimatePresence>
            </div>
          </section>
          <aside className="dashboard__side">
            <GuardCard guard={snapshot.guard} onToggle={onToggleGuard} />
          </aside>
        </div>
      </div>
    </motion.main>
  );
}
