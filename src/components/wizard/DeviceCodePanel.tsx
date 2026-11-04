import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";

import type { LoginState } from "../../hooks/loginReducer";
import { CheckIcon, CopyIcon, ExternalIcon, WarningIcon } from "../common/Icons";
import { Spinner } from "../common/Spinner";

interface DeviceCodePanelProps {
  state: LoginState;
  title: string;
  onOpen: (url: string) => void;
  onCancel: () => void;
  onRetry: () => void;
}

/**
 * GitHub's device login: the one-time code flips in character by character while
 * Sentiong waits for the user to approve in the browser.
 */
export function DeviceCodePanel({ state, title, onOpen, onCancel, onRetry }: DeviceCodePanelProps) {
  const [copied, setCopied] = useState(false);

  const copy = async (code: string) => {
    await navigator.clipboard?.writeText(code).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <motion.div
      className="device-code panel"
      initial={{ opacity: 0, y: 16, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.97 }}
      transition={{ type: "spring", stiffness: 220, damping: 24 }}
    >
      <p className="device-code__title">{title}</p>
      <AnimatePresence mode="wait">
        {state.status === "starting" && (
          <motion.div key="starting" className="device-code__status" exit={{ opacity: 0 }}>
            <Spinner /> Asking GitHub for a code…
          </motion.div>
        )}

        {state.status === "waiting" && (
          <motion.div key="waiting" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <p className="device-code__help">Enter this code on the GitHub page that just opened:</p>
            <div className="device-code__code" aria-label={state.code}>
              {state.code.split("").map((character, index) => (
                <motion.span
                  key={`${state.code}-${index}`}
                  className={character === "-" ? "device-code__dash" : "device-code__char"}
                  initial={{ rotateX: -90, opacity: 0, y: -10 }}
                  animate={{ rotateX: 0, opacity: 1, y: 0 }}
                  transition={{ type: "spring", stiffness: 260, damping: 18, delay: index * 0.06 }}
                  aria-hidden="true"
                >
                  {character}
                </motion.span>
              ))}
            </div>
            <div className="device-code__actions">
              <button type="button" className="button button--small button--ghost" onClick={() => void copy(state.code)}>
                {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
                {copied ? "Copied" : "Copy code"}
              </button>
              <button type="button" className="button button--small button--ghost" onClick={() => onOpen(state.verificationUrl)}>
                <ExternalIcon size={14} />
                Open github.com
              </button>
              <button type="button" className="button button--small button--ghost" onClick={onCancel}>
                Cancel
              </button>
            </div>
            <p className="device-code__waiting">
              <span className="device-code__pulse" /> Waiting for you to approve on GitHub…
            </p>
          </motion.div>
        )}

        {state.status === "failed" && (
          <motion.div
            key="failed"
            className="device-code__failed"
            role="alert"
            initial={{ opacity: 0, x: 0 }}
            animate={{ opacity: 1, x: [0, -8, 8, -4, 4, 0] }}
            exit={{ opacity: 0 }}
          >
            <WarningIcon size={16} />
            <span>{state.message}</span>
            <button type="button" className="button button--small button--ghost" onClick={onRetry}>
              Try again
            </button>
            <button type="button" className="button button--small button--ghost" onClick={onCancel}>
              Close
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
