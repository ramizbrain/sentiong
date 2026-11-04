import { AnimatePresence, motion } from "motion/react";

import { accentStyle } from "../../lib/profileColors";
import type { Profile } from "../../types/sentiong";
import { Avatar } from "../common/Avatar";
import { GithubIcon, KeyIcon, SignatureIcon } from "../common/Icons";
import { Burst } from "../motion/Burst";

interface ActiveHeroProps {
  profile: Profile | null;
  /** Changes on every switch to replay the burst. */
  switchCount: number;
}

/** "Committing as …": the default profile, big, swapping in with a burst on change. */
export function ActiveHero({ profile, switchCount }: ActiveHeroProps) {
  return (
    <section className="active-hero panel" style={profile ? accentStyle(profile.color) : undefined}>
      <div className="active-hero__sheen" aria-hidden="true" />
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={profile?.id ?? "none"}
          className="active-hero__content"
          initial={{ opacity: 0, y: 30, filter: "blur(10px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, y: -30, filter: "blur(10px)" }}
          transition={{ type: "spring", stiffness: 150, damping: 20 }}
        >
          <div className="active-hero__avatar">
            <span className="active-hero__halo" aria-hidden="true" />
            {profile && <Avatar login={profile.githubLogin} label={profile.label} size={76} />}
            {switchCount > 0 && <Burst burstKey={switchCount} radius={110} />}
          </div>
          <div className="active-hero__text">
            <p className="active-hero__eyebrow">Committing as</p>
            <h1 className="active-hero__label">{profile?.label ?? "No default profile"}</h1>
            {profile && (
              <p className="active-hero__meta">
                <span className="mono">{profile.gitEmail}</span>
                {profile.githubLogin && (
                  <span className="chip">
                    <GithubIcon size={12} />
                    <span>@{profile.githubLogin}</span>
                  </span>
                )}
                {profile.sshKeyPath && (
                  <span className="chip">
                    <KeyIcon size={12} />
                    <span>SSH</span>
                  </span>
                )}
                {profile.signing && (
                  <span className="chip chip--success">
                    <SignatureIcon size={12} />
                    <span>Signed</span>
                  </span>
                )}
              </p>
            )}
          </div>
        </motion.div>
      </AnimatePresence>
      <p className="active-hero__hint">
        Used wherever no folder or organization rule applies. Switch it here or from the menu bar.
      </p>
    </section>
  );
}
