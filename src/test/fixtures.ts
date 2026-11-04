import type { GithubUser, Profile, RepoReport, Snapshot } from "../types/sentiong";

export function profile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: "work",
    label: "Work",
    color: "cyan",
    githubLogin: "octo-work",
    gitName: "Octo Cat",
    gitEmail: "octo@work.example",
    sshKeyPath: "/home/octo/.ssh/sentiong_work",
    signing: true,
    folders: ["/home/octo/work"],
    owners: ["octo-org"],
    ...overrides,
  };
}

export function snapshot(overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    profiles: [profile({ id: "personal", label: "Personal", color: "iris", githubLogin: "octo" }), profile()],
    activeProfileId: "personal",
    guard: { enabled: false, conflict: null },
    connected: true,
    ...overrides,
  };
}

export function githubUser(overrides: Partial<GithubUser> = {}): GithubUser {
  return {
    login: "octo-work",
    id: 42,
    name: "Octo Cat",
    publicEmail: "octo@work.example",
    noreplyEmail: "42+octo-work@users.noreply.github.com",
    avatarUrl: "",
    organizations: ["octo-org"],
    ...overrides,
  };
}

export function report(overrides: Partial<RepoReport> = {}): RepoReport {
  return {
    path: "/home/octo/code/app",
    name: "app",
    remoteUrl: "git@github.com:octo-org/app.git",
    owner: "octo-org",
    email: "octo@work.example",
    effectiveProfileId: "work",
    expectedProfileId: "work",
    status: "ok",
    guardBypassed: false,
    ...overrides,
  };
}
