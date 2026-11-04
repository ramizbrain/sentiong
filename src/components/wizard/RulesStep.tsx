import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";

import { shortenPath } from "../../lib/format";
import type { ProfileDraft } from "../../lib/profileDraft";
import { isGithubName, ownerSuggestions, toggleIn } from "../../lib/profileDraft";
import type { GithubUser } from "../../types/sentiong";
import { BuildingIcon, CloseIcon, FolderIcon, PlusIcon } from "../common/Icons";
import { Toggle } from "../common/Toggle";

interface RulesStepProps {
  draft: ProfileDraft;
  user: GithubUser | null;
  homeDirectory: string;
  ownerRulesSupported: boolean;
  canBeDefault: boolean;
  onChange: (patch: Partial<ProfileDraft>) => void;
  onPickFolder: () => void;
}

export function RulesStep({
  draft,
  user,
  homeDirectory,
  ownerRulesSupported,
  canBeDefault,
  onChange,
  onPickFolder,
}: RulesStepProps) {
  const [ownerInput, setOwnerInput] = useState("");
  const suggestions = ownerSuggestions(draft, user);

  const addOwner = () => {
    const owner = ownerInput.trim().replace(/^@/, "");
    if (!isGithubName(owner)) return;
    if (!draft.owners.some((existing) => existing.toLowerCase() === owner.toLowerCase())) {
      onChange({ owners: [...draft.owners, owner] });
    }
    setOwnerInput("");
  };

  return (
    <div className="wizard-step">
      <h2 className="wizard-step__title">Where should this profile kick in?</h2>
      <p className="wizard-step__lead">
        Repositories that match a rule use this profile automatically. No switching, ever.
      </p>

      <section className="rule-block">
        <header className="rule-block__header">
          <FolderIcon size={16} />
          <div>
            <h3>Folders</h3>
            <p>Every repository inside these folders.</p>
          </div>
          <button type="button" className="button button--small button--ghost" onClick={onPickFolder}>
            <PlusIcon size={14} />
            Add folder
          </button>
        </header>
        <ul className="rule-list">
          <AnimatePresence initial={false}>
            {draft.folders.map((folder) => (
              <motion.li
                key={folder}
                className="rule-item"
                layout
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
              >
                <span className="mono">{shortenPath(folder, homeDirectory)}</span>
                <button
                  type="button"
                  className="rule-item__remove"
                  aria-label={`Remove ${folder}`}
                  onClick={() => onChange({ folders: draft.folders.filter((existing) => existing !== folder) })}
                >
                  <CloseIcon size={12} />
                </button>
              </motion.li>
            ))}
          </AnimatePresence>
          {draft.folders.length === 0 && <li className="rule-list__empty">No folders yet</li>}
        </ul>
      </section>

      <section className="rule-block">
        <header className="rule-block__header">
          <BuildingIcon size={16} />
          <div>
            <h3>GitHub owners</h3>
            <p>
              Repositories from these users or organizations, wherever you clone them.
              {!ownerRulesSupported && " (Needs Git 2.36+; with older Git they only feed the guard.)"}
            </p>
          </div>
        </header>
        <div className="owner-options">
          {suggestions.map((owner) => {
            const on = draft.owners.some((existing) => existing.toLowerCase() === owner.toLowerCase());
            return (
              <motion.button
                key={owner}
                type="button"
                layout
                className="owner-option"
                data-on={on}
                onClick={() => onChange({ owners: toggleIn(draft.owners, owner) })}
                whileTap={{ scale: 0.94 }}
              >
                <span className="owner-option__box">{on && <motion.span layoutId={`owner-${owner}`} className="owner-option__fill" />}</span>
                {owner}
              </motion.button>
            );
          })}
          <form
            className="owner-add"
            onSubmit={(event) => {
              event.preventDefault();
              addOwner();
            }}
          >
            <input
              className="input"
              placeholder="another-org"
              value={ownerInput}
              onChange={(event) => setOwnerInput(event.target.value)}
            />
            <button type="submit" className="icon-button" aria-label="Add owner" disabled={!isGithubName(ownerInput.trim().replace(/^@/, ""))}>
              <PlusIcon />
            </button>
          </form>
        </div>
      </section>

      <label className="default-toggle">
        <span>
          <strong>Use it everywhere else too</strong>
          <span>Make this the default profile for repositories no rule matches.</span>
        </span>
        <Toggle
          checked={draft.makeDefault}
          disabled={!canBeDefault}
          label="Make default"
          onChange={(makeDefault) => onChange({ makeDefault })}
        />
      </label>
    </div>
  );
}
