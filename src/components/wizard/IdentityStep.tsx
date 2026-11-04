import { motion } from "motion/react";

import type { EmailChoice, ProfileDraft } from "../../lib/profileDraft";
import { accentStyle, COLOR_KEYS, PROFILE_COLORS } from "../../lib/profileColors";
import type { GithubUser } from "../../types/sentiong";

interface IdentityStepProps {
  draft: ProfileDraft;
  user: GithubUser | null;
  onChange: (patch: Partial<ProfileDraft>) => void;
}

const LABEL_IDEAS = ["Personal", "Work", "Freelance", "Open source"];

interface EmailOption {
  choice: EmailChoice;
  title: string;
  value: string | null;
  hint: string;
}

function emailOptions(user: GithubUser | null): EmailOption[] {
  const options: EmailOption[] = [];
  if (user) {
    options.push({
      choice: "noreply",
      title: "Private GitHub address",
      value: user.noreplyEmail,
      hint: "Recommended. Commits still link to your account; your real address stays hidden.",
    });
    if (user.publicEmail) {
      options.push({ choice: "public", title: "Public profile email", value: user.publicEmail, hint: "Shown on your GitHub profile." });
    }
  }
  options.push({ choice: "custom", title: "Another address", value: null, hint: "For example your work email." });
  return options;
}

export function IdentityStep({ draft, user, onChange }: IdentityStepProps) {
  return (
    <div className="wizard-step">
      <h2 className="wizard-step__title">How should this profile sign its commits?</h2>

      <div className="identity-grid">
        <label className="field">
          <span className="field__label">Profile name</span>
          <input
            className="input"
            value={draft.label}
            maxLength={40}
            placeholder="Work"
            onChange={(event) => onChange({ label: event.target.value })}
          />
          <span className="label-ideas">
            {LABEL_IDEAS.map((idea) => (
              <button
                key={idea}
                type="button"
                className="chip chip-button"
                data-active={draft.label === idea}
                onClick={() => onChange({ label: idea })}
              >
                {idea}
              </button>
            ))}
          </span>
        </label>

        <div className="field">
          <span className="field__label">Color</span>
          <div className="swatches" role="radiogroup" aria-label="Color">
            {COLOR_KEYS.map((color) => (
              <button
                key={color}
                type="button"
                role="radio"
                aria-checked={draft.color === color}
                aria-label={PROFILE_COLORS[color].name}
                className="swatch"
                style={accentStyle(color)}
                onClick={() => onChange({ color })}
              >
                {draft.color === color && (
                  <motion.span layoutId="swatch-ring" className="swatch__ring" transition={{ type: "spring", stiffness: 400, damping: 28 }} />
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      <label className="field">
        <span className="field__label">Author name</span>
        <input
          className="input"
          value={draft.gitName}
          placeholder="Your Name"
          onChange={(event) => onChange({ gitName: event.target.value })}
        />
      </label>

      <div className="field">
        <span className="field__label">Commit email</span>
        <div className="email-options">
          {emailOptions(user).map((option) => {
            const selected = draft.emailChoice === option.choice;
            return (
              <div
                key={option.choice}
                className="email-option"
                data-selected={selected}
                role="radio"
                aria-checked={selected}
                tabIndex={0}
                onClick={() => onChange({ emailChoice: option.choice })}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") onChange({ emailChoice: option.choice });
                }}
              >
                {selected && <motion.span layoutId="email-selected" className="email-option__ring" />}
                <span className="email-option__radio" />
                <span className="email-option__body">
                  <span className="email-option__title">{option.title}</span>
                  {option.value ? (
                    <span className="email-option__value mono">{option.value}</span>
                  ) : (
                    selected && (
                      <input
                        className="input email-option__input"
                        autoFocus
                        type="email"
                        placeholder="you@company.com"
                        value={draft.customEmail}
                        onClick={(event) => event.stopPropagation()}
                        onChange={(event) => onChange({ customEmail: event.target.value })}
                      />
                    )
                  )}
                  <span className="email-option__hint">{option.hint}</span>
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
