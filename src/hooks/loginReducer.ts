import type { LoginEvent } from "../types/sentiong";

export type LoginState =
  | { status: "idle" }
  | { status: "starting" }
  | { status: "waiting"; code: string; verificationUrl: string }
  | { status: "completed"; login: string | null }
  | { status: "failed"; message: string };

export type LoginAction = { type: "start" } | { type: "event"; event: LoginEvent } | { type: "reset" };

export const initialLoginState: LoginState = { status: "idle" };

export function loginReducer(state: LoginState, action: LoginAction): LoginState {
  switch (action.type) {
    case "start":
      return { status: "starting" };
    case "reset":
      return initialLoginState;
    case "event": {
      const { event } = action;
      switch (event.type) {
        case "code":
          return { status: "waiting", code: event.code, verificationUrl: event.verificationUrl };
        case "completed":
          return { status: "completed", login: event.login };
        case "failed":
          return { status: "failed", message: event.message };
        case "cancelled":
          return initialLoginState;
      }
    }
  }
  return state;
}
