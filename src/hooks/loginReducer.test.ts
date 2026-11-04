import { describe, expect, it } from "vitest";

import { initialLoginState, loginReducer } from "./loginReducer";

describe("loginReducer", () => {
  it("walks through a successful login", () => {
    let state = loginReducer(initialLoginState, { type: "start" });
    expect(state.status).toBe("starting");

    state = loginReducer(state, {
      type: "event",
      event: { type: "code", code: "AB12-CD34", verificationUrl: "https://github.com/login/device" },
    });
    expect(state).toEqual({ status: "waiting", code: "AB12-CD34", verificationUrl: "https://github.com/login/device" });

    state = loginReducer(state, { type: "event", event: { type: "completed", login: "octo" } });
    expect(state).toEqual({ status: "completed", login: "octo" });
  });

  it("returns to idle when cancelled and keeps failure messages", () => {
    const waiting = loginReducer(initialLoginState, { type: "start" });
    expect(loginReducer(waiting, { type: "event", event: { type: "cancelled" } })).toEqual(initialLoginState);
    expect(loginReducer(waiting, { type: "event", event: { type: "failed", message: "denied" } })).toEqual({
      status: "failed",
      message: "denied",
    });
  });
});
