import { AnimatePresence, motion } from "motion/react";

import type { LoginState } from "../../hooks/loginReducer";
import type { GhAccount } from "../../types/sentiong";
import { Avatar } from "../common/Avatar";
import { CheckIcon, GithubIcon, PlusIcon } from "../common/Icons";
import { Spinner } from "../common/Spinner";
import { DeviceCodePanel } from "./DeviceCodePanel";

interface AccountStepProps {
  ghFound: boolean;
  accounts: GhAccount[];
  selectedLogin: string | null;
  gitOnly: boolean;
  loadingLogin: string | null;
  /** Logins used by other profiles, with the profile's name. */
  usedBy: Record<string, string>;
  login: LoginState;
  onSelect: (login: string) => void;
  onGitOnly: () => void;
  onConnectNew: () => void;
  onCancelLogin: () => void;
  onOpenUrl: (url: string) => void;
}

export function AccountStep({
  ghFound,
  accounts,
  selectedLogin,
  gitOnly,
  loadingLogin,
  usedBy,
  login,
  onSelect,
  onGitOnly,
  onConnectNew,
  onCancelLogin,
  onOpenUrl,
}: AccountStepProps) {
  const loggingIn = login.status !== "idle" && login.status !== "completed";

  return (
    <div className="wizard-step">
      <h2 className="wizard-step__title">Which GitHub account is this?</h2>
      <p className="wizard-step__lead">
        Pick an account gh is already signed in to, or connect a new one in your browser. Sentiong never stores your
        tokens; gh keeps them in your system keychain.
      </p>

      {!ghFound && (
        <p className="wizard-step__note">
          The GitHub CLI isn't installed, so this profile can only set a Git identity. Install <code>gh</code> to
          connect accounts and upload keys.
        </p>
      )}

      <div className="account-list">
        {accounts.map((account, index) => {
          const selected = account.login === selectedLogin;
          return (
            <motion.button
              key={account.login}
              type="button"
              className="account-option"
              data-selected={selected}
              onClick={() => onSelect(account.login)}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.06, type: "spring", stiffness: 200, damping: 20 }}
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.98 }}
            >
              <Avatar login={account.login} label={account.login} size={40} />
              <span className="account-option__text">
                <span className="account-option__login">@{account.login}</span>
                <span className="account-option__meta">
                  {!account.healthy
                    ? "Signed out: reconnect in gh"
                    : usedBy[account.login]
                      ? `Used by ${usedBy[account.login]}`
                      : account.active
                        ? "Active in gh right now"
                        : "Signed in to gh"}
                </span>
              </span>
              <span className="account-option__check">
                {loadingLogin === account.login ? (
                  <Spinner />
                ) : (
                  <AnimatePresence>
                    {selected && (
                      <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}>
                        <CheckIcon size={14} />
                      </motion.span>
                    )}
                  </AnimatePresence>
                )}
              </span>
              {selected && <motion.span layoutId="account-selected" className="account-option__ring" />}
            </motion.button>
          );
        })}

        {ghFound && (
          <motion.button
            type="button"
            className="account-option account-option--new"
            onClick={onConnectNew}
            disabled={loggingIn}
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.98 }}
          >
            <span className="account-option__plus">
              <PlusIcon />
            </span>
            <span className="account-option__text">
              <span className="account-option__login">Connect another account</span>
              <span className="account-option__meta">Sign in with your browser</span>
            </span>
            <GithubIcon size={18} />
          </motion.button>
        )}
      </div>

      <AnimatePresence>
        {loggingIn && (
          <DeviceCodePanel
            state={login}
            title="Connecting a GitHub account"
            onOpen={onOpenUrl}
            onCancel={onCancelLogin}
            onRetry={onConnectNew}
          />
        )}
      </AnimatePresence>

      <button type="button" className="wizard-step__link" data-selected={gitOnly} aria-pressed={gitOnly} onClick={onGitOnly}>
        {gitOnly ? "✓ " : ""}No GitHub account: just a name and email for commits
      </button>
    </div>
  );
}
