import { motion } from "motion/react";

import { shortKey } from "../../lib/format";
import type { KeyChoice, ProfileDraft } from "../../lib/profileDraft";
import type { SshKey } from "../../types/sentiong";
import { KeyIcon, SignatureIcon } from "../common/Icons";
import { Toggle } from "../common/Toggle";

interface SecurityStepProps {
  draft: ProfileDraft;
  keys: SshKey[];
  canGenerate: boolean;
  onChange: (patch: Partial<ProfileDraft>) => void;
}

const CHOICES: { choice: KeyChoice; title: string; hint: string }[] = [
  { choice: "generate", title: "Create a new key", hint: "Recommended: one key per profile, so GitHub always knows who you are." },
  { choice: "existing", title: "Use a key I already have", hint: "Pick one from ~/.ssh." },
  { choice: "none", title: "No SSH key", hint: "HTTPS remotes still work through gh." },
];

export function SecurityStep({ draft, keys, canGenerate, onChange }: SecurityStepProps) {
  const hasKey = draft.keyChoice !== "none";
  const hasAccount = draft.githubLogin !== null;

  return (
    <div className="wizard-step">
      <h2 className="wizard-step__title">Keys and signing</h2>
      <p className="wizard-step__lead">
        Sentiong tells Git which key to use for this profile, so pushes go out as the right account without editing
        any remote URLs.
      </p>

      <div className="key-choices">
        {CHOICES.map(({ choice, title, hint }) => {
          const selected = draft.keyChoice === choice;
          const disabled = (choice === "generate" && !canGenerate) || (choice === "existing" && keys.length === 0);
          return (
            <button
              key={choice}
              type="button"
              className="key-choice"
              data-selected={selected}
              disabled={disabled}
              onClick={() => onChange({ keyChoice: choice, signing: choice === "none" ? false : draft.signing })}
            >
              {selected && <motion.span layoutId="key-choice" className="key-choice__ring" />}
              <KeyIcon size={18} />
              <span className="key-choice__title">{title}</span>
              <span className="key-choice__hint">{hint}</span>
            </button>
          );
        })}
      </div>

      {draft.keyChoice === "existing" && (
        <motion.ul className="key-list" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}>
          {keys.map((key) => (
            <li key={key.privateKeyPath}>
              <button
                type="button"
                className="key-list__item"
                data-selected={draft.existingKeyPath === key.privateKeyPath}
                onClick={() => onChange({ existingKeyPath: key.privateKeyPath })}
              >
                <span className="mono">{key.privateKeyPath.split(/[\\/]/).pop()}</span>
                <span className="key-list__detail mono">{shortKey(key.publicKey)}</span>
                {key.comment && <span className="key-list__detail">{key.comment}</span>}
              </button>
            </li>
          ))}
        </motion.ul>
      )}

      <div className="security-toggles">
        <label className="default-toggle" data-disabled={!hasKey || !hasAccount}>
          <span>
            <strong>Add the key to @{draft.githubLogin ?? "your account"}</strong>
            <span>
              {hasAccount
                ? "Uploads the public key to GitHub, so SSH pushes work right away."
                : "Connect a GitHub account to upload keys."}
            </span>
          </span>
          <Toggle
            checked={draft.uploadKey && hasKey && hasAccount}
            disabled={!hasKey || !hasAccount}
            label="Upload key to GitHub"
            onChange={(uploadKey) => onChange({ uploadKey })}
          />
        </label>
        <label className="default-toggle" data-disabled={!hasKey}>
          <span>
            <strong>
              <SignatureIcon size={14} /> Sign commits
            </strong>
            <span>Every commit and tag gets the "Verified" badge on GitHub.</span>
          </span>
          <Toggle
            checked={draft.signing && hasKey}
            disabled={!hasKey}
            label="Sign commits"
            onChange={(signing) => onChange({ signing })}
          />
        </label>
      </div>
    </div>
  );
}
