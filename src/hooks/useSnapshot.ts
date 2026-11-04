import { useCallback, useEffect, useState } from "react";

import { toErrorMessage } from "../lib/errors";
import { api } from "../services/sentiongApi";
import type { Snapshot } from "../types/sentiong";

/**
 * The current profiles. Stays in sync with changes made anywhere, including the
 * tray menu, through the backend's `snapshot-changed` event.
 */
export function useSnapshot() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;

    api
      .getSnapshot()
      .then((loaded) => !cancelled && setSnapshot(loaded))
      .catch((error) => !cancelled && setLoadError(toErrorMessage(error)));
    void api.onSnapshotChanged((next) => setSnapshot(next)).then((stop) => {
      if (cancelled) stop();
      else unlisten = stop;
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  /** Runs a change and adopts the snapshot it returns. Rejects like the change does. */
  const apply = useCallback(async (change: () => Promise<Snapshot>) => {
    const next = await change();
    setSnapshot(next);
    return next;
  }, []);

  return { snapshot, loadError, apply };
}
