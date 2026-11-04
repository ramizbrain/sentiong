import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";

import { PlugIcon } from "../common/Icons";

interface ConnectionMenuProps {
  connected: boolean;
  onChange: (connected: boolean) => void;
}

/** Shows whether Git uses Sentiong, with a way to take it out (and back in). */
export function ConnectionMenu({ connected, onChange }: ConnectionMenuProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div className="connection" ref={root}>
      <button
        type="button"
        className="connection__pill"
        data-connected={connected}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="connection__dot" />
        {connected ? "Connected to Git" : "Disconnected"}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            className="connection__popover panel"
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 420, damping: 30 }}
          >
            <p>
              {connected
                ? "Sentiong adds one marked block to ~/.gitconfig that includes your profiles. Disconnecting removes it (and the guard); your profiles stay saved here."
                : "Git ignores your profiles right now. Reconnect to add Sentiong's block back to ~/.gitconfig."}
            </p>
            <button
              type="button"
              className={`button button--small ${connected ? "button--danger" : "button--primary"}`}
              onClick={() => {
                onChange(!connected);
                setOpen(false);
              }}
            >
              <PlugIcon size={14} />
              {connected ? "Disconnect from Git" : "Reconnect"}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
