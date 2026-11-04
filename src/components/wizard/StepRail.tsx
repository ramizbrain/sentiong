import { motion } from "motion/react";

import type { WizardStep } from "../../lib/profileDraft";
import { WIZARD_STEPS } from "../../lib/profileDraft";
import { CheckIcon } from "../common/Icons";

const LABELS: Record<WizardStep, string> = {
  account: "Account",
  identity: "Identity",
  rules: "Where",
  security: "Keys",
};

interface StepRailProps {
  current: number;
  onJump: (index: number) => void;
}

/** Progress through the wizard; finished steps can be revisited. */
export function StepRail({ current, onJump }: StepRailProps) {
  return (
    <ol className="step-rail">
      <motion.span
        className="step-rail__progress"
        initial={false}
        animate={{ scaleX: current / (WIZARD_STEPS.length - 1) }}
        transition={{ type: "spring", stiffness: 160, damping: 24 }}
        aria-hidden="true"
      />
      {WIZARD_STEPS.map((step, index) => {
        const state = index < current ? "done" : index === current ? "current" : "upcoming";
        return (
          <li key={step} className="step-rail__item" data-state={state}>
            <button
              type="button"
              className="step-rail__dot"
              onClick={() => onJump(index)}
              disabled={index > current}
              aria-current={state === "current" ? "step" : undefined}
              aria-label={LABELS[step]}
            >
              {state === "current" && (
                <motion.span layoutId="step-rail-current" className="step-rail__current" transition={{ type: "spring", stiffness: 300, damping: 28 }} />
              )}
              {state === "done" ? <CheckIcon size={13} /> : <span>{index + 1}</span>}
            </button>
            <span className="step-rail__label">{LABELS[step]}</span>
          </li>
        );
      })}
    </ol>
  );
}
