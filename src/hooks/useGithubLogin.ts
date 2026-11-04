import { useCallback, useReducer } from "react";

import { toErrorMessage } from "../lib/errors";
import { api } from "../services/sentiongApi";
import type { LoginEvent } from "../types/sentiong";
import { initialLoginState, loginReducer } from "./loginReducer";

export type LoginRequest = { kind: "newAccount" } | { kind: "grantKeyPermissions"; login: string };

/**
 * A GitHub browser login: shows a one-time code, opens github.com, and resolves with
 * the login once the user approves (or `null` if it failed or was cancelled).
 */
export function useGithubLogin() {
  const [state, dispatch] = useReducer(loginReducer, initialLoginState);

  const start = useCallback(async (request: LoginRequest): Promise<string | null> => {
    dispatch({ type: "start" });
    let result: string | null = null;
    const onEvent = (event: LoginEvent) => {
      dispatch({ type: "event", event });
      if (event.type === "code") void api.openUrl(event.verificationUrl);
      if (event.type === "completed") result = event.login ?? (request.kind === "grantKeyPermissions" ? request.login : null);
    };
    try {
      if (request.kind === "newAccount") await api.startGithubLogin(onEvent);
      else await api.grantKeyPermissions(request.login, onEvent);
    } catch (error) {
      dispatch({ type: "event", event: { type: "failed", message: toErrorMessage(error) } });
    }
    return result;
  }, []);

  const cancel = useCallback(() => {
    void api.cancelGithubLogin();
    dispatch({ type: "reset" });
  }, []);

  const reset = useCallback(() => dispatch({ type: "reset" }), []);

  return { state, start, cancel, reset };
}
