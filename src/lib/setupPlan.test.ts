import { describe, expect, it } from "vitest";

import { newDraft } from "./profileDraft";
import { planSetup } from "./setupPlan";

describe("planSetup", () => {
  const withAccount = { ...newDraft([]), githubLogin: "octo" };

  it("creates, uploads, and registers a new key for a full profile", () => {
    expect(planSetup(withAccount, false).map((task) => task.id)).toEqual([
      "generateKey",
      "uploadAuthKey",
      "uploadSigningKey",
      "saveProfile",
      "makeDefault",
    ]);
  });

  it("only saves a Git-only profile", () => {
    const draft = { ...newDraft([]), keyChoice: "none" as const, signing: false, makeDefault: false };
    expect(planSetup(draft, false).map((task) => task.id)).toEqual(["saveProfile"]);
  });

  it("skips uploads without an account and the default step when already default", () => {
    const draft = { ...newDraft([]), keyChoice: "existing" as const, existingKeyPath: "/k" };
    expect(planSetup(draft, true).map((task) => task.id)).toEqual(["saveProfile"]);
  });

  it("does not register a signing key when signing is off", () => {
    const ids = planSetup({ ...withAccount, signing: false }, true).map((task) => task.id);
    expect(ids).toEqual(["generateKey", "uploadAuthKey", "saveProfile"]);
  });
});
