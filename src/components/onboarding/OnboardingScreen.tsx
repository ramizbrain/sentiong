import { motion } from "motion/react";
import type { Variants } from "motion/react";

import type { Environment, GhAccount } from "../../types/sentiong";
import { ArrowRightIcon, RefreshIcon } from "../common/Icons";
import { RevealText } from "../motion/RevealText";
import { IdentityOrbit } from "./IdentityOrbit";
import { ToolChecklist } from "./ToolChecklist";

interface OnboardingScreenProps {
  environment: Environment | null;
  accounts: GhAccount[];
  onStart: () => void;
  onRefresh: () => void;
}

const rise: Variants = {
  hidden: { opacity: 0, y: 22, filter: "blur(8px)" },
  shown: (delay: number) => ({
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { type: "spring", stiffness: 90, damping: 18, delay },
  }),
};

export function OnboardingScreen({ environment, accounts, onStart, onRefresh }: OnboardingScreenProps) {
  const ready = environment?.git.found ?? false;

  return (
    <motion.main
      className="screen onboarding"
      exit={{ opacity: 0, scale: 1.05, filter: "blur(12px)", transition: { duration: 0.5 } }}
    >
      <div className="titlebar" data-tauri-drag-region />
      <section className="onboarding__visual">
        <IdentityOrbit accounts={accounts} />
      </section>

      <section className="onboarding__copy">
        <motion.p className="eyebrow" variants={rise} custom={0} initial="hidden" animate="shown">
          Work and personal, never mixed up
        </motion.p>
        <RevealText
          className="onboarding__title"
          text="Never commit with the wrong account again."
          delay={0.15}
          highlight={(word, index) => (index >= 4 && index <= 5 ? <span className="text-gradient">{word}</span> : null)}
        />
        <motion.p className="onboarding__subtitle" variants={rise} custom={0.55} initial="hidden" animate="shown">
          Sentiong gives each of your identities a profile: GitHub account, commit email, SSH key and signing. It
          picks the right one for every repository on its own, by folder or by GitHub organization.
        </motion.p>

        {environment && <ToolChecklist environment={environment} accounts={accounts} />}

        <motion.div className="onboarding__actions" variants={rise} custom={1.4} initial="hidden" animate="shown">
          <motion.button
            type="button"
            className="button button--primary onboarding__cta"
            onClick={onStart}
            disabled={!ready}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
          >
            Create your first profile
            <ArrowRightIcon />
          </motion.button>
          <button type="button" className="button button--ghost" onClick={onRefresh}>
            <RefreshIcon />
            Check again
          </button>
        </motion.div>
      </section>
    </motion.main>
  );
}
