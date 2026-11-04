import { describe, expect, it } from "vitest";

import { githubUser, profile } from "../test/fixtures";
import {
  draftFromProfile,
  newDraft,
  ownerSuggestions,
  resolveEmail,
  stepProblem,
  toProfileInput,
  toggleIn,
  withGithubUser,
  withoutGithub,
} from "./profileDraft";

describe("newDraft", () => {
  it("suggests a name and color the existing profiles don't use", () => {
    const draft = newDraft([profile({ label: "Personal", color: "iris" })]);

    expect(draft.label).toBe("Work");
    expect(draft.color).toBe("cyan");
    expect(draft.makeDefault).toBe(false);
  });

  it("makes the very first profile the default", () => {
    expect(newDraft([]).makeDefault).toBe(true);
  });
});

describe("withGithubUser", () => {
  it("fills in the name and links the account as an owner", () => {
    const draft = withGithubUser(newDraft([]), githubUser());

    expect(draft.githubLogin).toBe("octo-work");
    expect(draft.gitName).toBe("Octo Cat");
    expect(draft.owners).toEqual(["octo-work"]);
  });

  it("keeps what the user already typed", () => {
    const draft = withGithubUser({ ...newDraft([]), gitName: "Typed", owners: ["mine"] }, githubUser());

    expect(draft.gitName).toBe("Typed");
    expect(draft.owners).toEqual(["mine"]);
  });

  it("resets the owners when switching to another account", () => {
    const first = withGithubUser(newDraft([]), githubUser({ login: "octo-home" }));
    const second = withGithubUser({ ...first, owners: ["octo-home", "home-org"] }, githubUser());

    expect(second.owners).toEqual(["octo-work"]);
  });

  it("goes back to the private address after a Git-only detour", () => {
    const draft = withGithubUser(withoutGithub(newDraft([])), githubUser());
    expect(draft.emailChoice).toBe("noreply");
  });

  it("falls back to the login when GitHub has no name", () => {
    expect(withGithubUser(newDraft([]), githubUser({ name: null })).gitName).toBe("octo-work");
  });
});

describe("resolveEmail", () => {
  const user = githubUser();

  it("uses the choice the user made", () => {
    const draft = newDraft([]);
    expect(resolveEmail({ ...draft, emailChoice: "noreply" }, user)).toBe("42+octo-work@users.noreply.github.com");
    expect(resolveEmail({ ...draft, emailChoice: "public" }, user)).toBe("octo@work.example");
    expect(resolveEmail({ ...draft, emailChoice: "custom", customEmail: " a@b.co " }, user)).toBe("a@b.co");
  });

  it("is empty when GitHub isn't connected", () => {
    expect(resolveEmail(newDraft([]), null)).toBe("");
  });
});

describe("stepProblem", () => {
  const user = githubUser();
  const ready = withGithubUser(newDraft([]), user);

  it("lets a complete draft through every step", () => {
    for (const step of ["account", "identity", "rules", "security"] as const) {
      expect(stepProblem(step, ready, user)).toBeNull();
    }
  });

  it("explains what is missing", () => {
    expect(stepProblem("identity", { ...ready, label: " " }, user)).toMatch(/name/);
    expect(stepProblem("identity", { ...ready, emailChoice: "custom", customEmail: "nope" }, user)).toMatch(/email/);
    expect(stepProblem("rules", { ...ready, owners: ["bad name"] }, user)).toMatch(/not a GitHub/);
    expect(stepProblem("security", { ...ready, keyChoice: "none", signing: true }, user)).toMatch(/SSH key/);
    expect(stepProblem("security", { ...ready, keyChoice: "existing", existingKeyPath: null }, user)).toMatch(
      /Choose/,
    );
  });
});

describe("draftFromProfile", () => {
  it("round-trips a profile without uploading its key again", () => {
    const existing = profile();
    const draft = draftFromProfile(existing, "work");

    expect(draft.uploadKey).toBe(false);
    expect(draft.makeDefault).toBe(true);
    expect(toProfileInput(draft, resolveEmail(draft, null), draft.existingKeyPath)).toEqual({
      label: existing.label,
      color: existing.color,
      githubLogin: existing.githubLogin,
      gitName: existing.gitName,
      gitEmail: existing.gitEmail,
      sshKeyPath: existing.sshKeyPath,
      signing: true,
      folders: existing.folders,
      owners: existing.owners,
    });
  });
});

describe("helpers", () => {
  it("never asks to sign without a key", () => {
    expect(toProfileInput({ ...newDraft([]), signing: true }, "a@b.co", null).signing).toBe(false);
  });

  it("drops GitHub-only options without an account", () => {
    const draft = withoutGithub(withGithubUser(newDraft([]), githubUser()));
    expect(draft.githubLogin).toBeNull();
    expect(draft.uploadKey).toBe(false);
    expect(draft.emailChoice).toBe("custom");
  });

  it("suggests the account and its organizations once each", () => {
    const draft = { ...newDraft([]), owners: ["Octo-Org", "extra"] };
    expect(ownerSuggestions(draft, githubUser())).toEqual(["octo-work", "octo-org", "extra"]);
  });

  it("toggles list entries case-insensitively", () => {
    expect(toggleIn(["a", "B"], "b")).toEqual(["a"]);
    expect(toggleIn(["a"], "c")).toEqual(["a", "c"]);
  });
});
