import { motion } from "motion/react";

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}

/** An on/off switch whose knob springs across. */
export function Toggle({ checked, onChange, label, disabled = false }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className="toggle"
      data-on={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <motion.span
        className="toggle__knob"
        layout
        transition={{ type: "spring", stiffness: 700, damping: 32 }}
      />
    </button>
  );
}
