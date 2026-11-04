import { useCallback, useEffect, useState } from "react";

import { api } from "../services/sentiongApi";
import type { Environment, GhAccount } from "../types/sentiong";

async function look(): Promise<{ environment: Environment; accounts: GhAccount[] }> {
  const environment = await api.getEnvironment();
  const accounts = environment.gh.found ? await api.listGhAccounts().catch(() => []) : [];
  return { environment, accounts };
}

/** Installed tools and the accounts gh is logged in to. `refresh` looks again. */
export function useEnvironment() {
  const [environment, setEnvironment] = useState<Environment | null>(null);
  const [accounts, setAccounts] = useState<GhAccount[]>([]);

  const adopt = useCallback((found: { environment: Environment; accounts: GhAccount[] }) => {
    setEnvironment(found.environment);
    setAccounts(found.accounts);
    return found;
  }, []);

  const refresh = useCallback(() => look().then(adopt), [adopt]);

  useEffect(() => {
    let cancelled = false;
    void look().then((found) => !cancelled && adopt(found));
    return () => {
      cancelled = true;
    };
  }, [adopt]);

  return { environment, accounts, refresh };
}
