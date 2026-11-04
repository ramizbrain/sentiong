import { AnimatePresence, motion } from "motion/react";

import type { Toast } from "../../hooks/useToasts";
import { CheckIcon, CloseIcon, WarningIcon } from "./Icons";

interface ToastsProps {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}

export function Toasts({ toasts, onDismiss }: ToastsProps) {
  return (
    <div className="toasts" aria-live="polite">
      <AnimatePresence initial={false}>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            layout
            className="toast panel"
            data-tone={toast.tone}
            role={toast.tone === "error" ? "alert" : "status"}
            initial={{ opacity: 0, y: 24, scale: 0.92, filter: "blur(6px)" }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, x: 40, scale: 0.95, transition: { duration: 0.25 } }}
            transition={{ type: "spring", stiffness: 380, damping: 28 }}
          >
            <span className="toast__icon">{toast.tone === "error" ? <WarningIcon /> : <CheckIcon />}</span>
            <span className="toast__message">{toast.message}</span>
            <button type="button" className="icon-button" aria-label="Dismiss" onClick={() => onDismiss(toast.id)}>
              <CloseIcon size={14} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
