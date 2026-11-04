import { useCallback, useRef, useState } from "react";

import { TOAST_MS } from "../lib/timing";

export interface Toast {
  id: number;
  tone: "success" | "error" | "info";
  message: string;
}

/** Short-lived messages stacked in a corner. */
export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback(
    (tone: Toast["tone"], message: string) => {
      const id = nextId.current++;
      setToasts((current) => [...current.slice(-2), { id, tone, message }]);
      setTimeout(() => dismiss(id), TOAST_MS);
    },
    [dismiss],
  );

  return { toasts, show, dismiss };
}
