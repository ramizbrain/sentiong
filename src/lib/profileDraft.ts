/**
 * The profile wizard's working copy. Pure functions only: the wizard component keeps
 * a draft in state and these decide defaults, validation, and the final input.
 */
import type { GithubUser, Profile, ProfileColor, ProfileInput } from "../types/sentiong";
import { nextColor } from "./profileColors";

export const WIZARD_STEPS = ["account", "identity", "rules", "security"] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number];

export type EmailChoice = "noreply" | "public" | "custom";
export type KeyChoice = "generate" | "existing" | "none";

export interface ProfileDraft {
  label: string;
  color: ProfileColor;
  githubLogin: string | null;
  gitName: string;
  emailChoice: EmailChoice;
  customEmail: string;
  folders: string[];
  owners: string[];
  keyChoice: KeyChoice;
  existingKeyPath: string | null;
  /** Add the key to the GitHub account (and as a signing key when signing). */
  uploadKey: boolean;
  signing: boolean;
  makeDefault: boolean;
}

const LABEL_SUGGESTIONS = ["Personal", "Work", "Freelance", "School", "Open source"];

/** A fresh draft whose name and color differ from the existing profiles. */
export function newDraft(profiles: readonly Profile[]): ProfileDraft {
  const usedLabels = new Set(profiles.map((profile) => profile.label.toLowerCase()));
  const label = LABEL_SUGGESTIONS.find((suggestion) => !usedLabels.has(suggestion.toLowerCase())) ?? "";
  return {
    label,
    color: nextColor(profiles.map((profile) => profile.color)),
    githubLogin: null,
    gitName: "",
    emailChoice: "noreply",
    customEmail: "",
    folders: [],
    owners: [],
    keyChoice: "generate",
    existingKeyPath: null,
    uploadKey: true,
    signing: true,
    makeDefault: profiles.length === 0,
  };
}

/** A draft for editing an existing profile. Its key is kept and not uploaded again. */
export function draftFromProfile(profile: Profile, activeProfileId: string | null): ProfileDraft {
  return {
    label: profile.label,
    color: profile.color,
    githubLogin: profile.githubLogin,
    gitName: profile.gitName,
    emailChoice: "custom",
    customEmail: profile.gitEmail,
    folders: [...profile.folders],
    owners: [...profile.owners],
    keyChoice: profile.sshKeyPath ? "existing" : "none",
    existingKeyPath: profile.sshKeyPath,
    uploadKey: false,
    signing: profile.signing,
    makeDefault: profile.id === activeProfileId,
  };
}

/**
 * Links a GitHub account and fills in what GitHub knows, without overwriting what the
 * user typed. Switching to another account resets the owners, which belonged to the
 * previous one.
 */
export function withGithubUser(draft: ProfileDraft, user: GithubUser): ProfileDraft {
  const switching = draft.githubLogin !== null && draft.githubLogin.toLowerCase() !== user.login.toLowerCase();
  const noEmailYet = draft.emailChoice === "custom" && draft.customEmail.trim() === "";
  return {
    ...draft,
    githubLogin: user.login,
    gitName: draft.gitName || user.name || user.login,
    owners: switching || draft.owners.length === 0 ? [user.login] : draft.owners,
    emailChoice: noEmailYet ? "noreply" : draft.emailChoice,
  };
}

/** Removes the GitHub account (for a profile that only sets a Git identity). */
export function withoutGithub(draft: ProfileDraft): ProfileDraft {
  return {
    ...draft,
    githubLogin: null,
    emailChoice: "custom",
    uploadKey: false,
  };
}

export function resolveEmail(draft: ProfileDraft, user: GithubUser | null): string {
  switch (draft.emailChoice) {
    case "noreply":
      return user?.noreplyEmail ?? "";
    case "public":
      return user?.publicEmail ?? "";
    case "custom":
      return draft.customEmail.trim();
  }
}

/** Owners worth offering: the account itself and its organizations. */
export function ownerSuggestions(draft: ProfileDraft, user: GithubUser | null): string[] {
  const candidates = [user?.login, ...(user?.organizations ?? []), ...draft.owners];
  const seen = new Set<string>();
  return candidates.filter((owner): owner is string => {
    if (!owner || seen.has(owner.toLowerCase())) return false;
    seen.add(owner.toLowerCase());
    return true;
  });
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GITHUB_NAME = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;

export function isGithubName(value: string): boolean {
  return GITHUB_NAME.test(value);
}

/** Why the user can't continue past `step` yet, or `null` when they can. */
export function stepProblem(step: WizardStep, draft: ProfileDraft, user: GithubUser | null): string | null {
  switch (step) {
    case "account":
      return null;
    case "identity": {
      if (!draft.label.trim()) return "Give this profile a name.";
      if (!draft.gitName.trim()) return "Commits need an author name.";
      const email = resolveEmail(draft, user);
      if (!EMAIL.test(email)) return "Enter the email your commits should use.";
      return null;
    }
    case "rules": {
      const badOwner = draft.owners.find((owner) => !isGithubName(owner));
      return badOwner ? `"${badOwner}" is not a GitHub user or organization name.` : null;
    }
    case "security":
      if (draft.keyChoice === "existing" && !draft.existingKeyPath) return "Choose one of your SSH keys.";
      if (draft.signing && draft.keyChoice === "none") return "Signing commits needs an SSH key.";
      return null;
  }
}

export function toProfileInput(draft: ProfileDraft, email: string, sshKeyPath: string | null): ProfileInput {
  return {
    label: draft.label.trim(),
    color: draft.color,
    githubLogin: draft.githubLogin,
    gitName: draft.gitName.trim(),
    gitEmail: email,
    sshKeyPath,
    signing: draft.signing && sshKeyPath !== null,
    folders: draft.folders,
    owners: draft.owners,
  };
}

/** Adds `value` to `list` (case-insensitively unique) or removes it. */
export function toggleIn(list: readonly string[], value: string): string[] {
  const exists = list.some((item) => item.toLowerCase() === value.toLowerCase());
  return exists ? list.filter((item) => item.toLowerCase() !== value.toLowerCase()) : [...list, value];
}
