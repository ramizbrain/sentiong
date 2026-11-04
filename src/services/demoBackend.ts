/**
 * An in-memory stand-in for the Rust backend, used when the UI runs in a plain browser
 * (`pnpm dev`). Nothing touches the real Git config. Add `?demo=full` to the URL to
 * start with sample profiles instead of the first-run screen.
 */
import type {
  GhAccount,
  GithubUser,
  LoginEvent,
  Profile,
  ProfileInput,
  RepoReport,
  Snapshot,
  SshKey,
} from "../types/sentiong";
import type { SentiongBackend } from "./backend";

const HOME = "/Users/octo";
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const sampleProfiles: Profile[] = [
  {
    id: "personal",
    label: "Personal",
    color: "iris",
    githubLogin: "octo-dev",
    gitName: "Octo Dev",
    gitEmail: "1001+octo-dev@users.noreply.github.com",
    sshKeyPath: `${HOME}/.ssh/sentiong_personal`,
    signing: true,
    folders: [`${HOME}/code`],
    owners: ["octo-dev"],
  },
  {
    id: "work",
    label: "Work",
    color: "cyan",
    githubLogin: "octo-at-acme",
    gitName: "Octo Dev",
    gitEmail: "octo@acme.example",
    sshKeyPath: `${HOME}/.ssh/sentiong_work`,
    signing: true,
    folders: [`${HOME}/acme`],
    owners: ["acme-inc", "acme-labs"],
  },
];

const accounts: GhAccount[] = [
  { login: "octo-dev", active: true, scopes: ["repo", "read:org", "admin:public_key"], healthy: true },
  { login: "octo-at-acme", active: false, scopes: ["repo", "read:org"], healthy: true },
];

const keys: SshKey[] = [
  {
    privateKeyPath: `${HOME}/.ssh/id_ed25519`,
    publicKey: "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIDemoKey",
    keyType: "ssh-ed25519",
    comment: "octo@laptop",
  },
];

function createState(): Snapshot {
  const full = new URLSearchParams(window.location.search).get("demo") === "full";
  return {
    profiles: full ? structuredClone(sampleProfiles) : [],
    activeProfileId: full ? "personal" : null,
    guard: { enabled: full, conflict: null },
    connected: true,
  };
}

const state = createState();
const listeners = new Set<(snapshot: Snapshot) => void>();
let loginTimer: ReturnType<typeof setTimeout> | undefined;

function publish(): Snapshot {
  const snapshot = structuredClone(state);
  listeners.forEach((listener) => listener(snapshot));
  return snapshot;
}

function slug(label: string): string {
  const base = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "profile";
  let id = base;
  for (let n = 2; state.profiles.some((profile) => profile.id === id); n++) id = `${base}-${n}`;
  return id;
}

function reject(code: string, message: string): Promise<never> {
  return Promise.reject({ code, message });
}

function fakeLogin(onEvent: (event: LoginEvent) => void, login: string | null): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(() => onEvent({ type: "code", code: "D3M0-C0DE", verificationUrl: "https://github.com/login/device" }), 700);
    loginTimer = setTimeout(() => {
      if (login && !accounts.some((account) => account.login === login)) {
        accounts.push({ login, active: false, scopes: ["repo", "admin:public_key", "admin:ssh_signing_key"], healthy: true });
      }
      accounts.forEach((account) => {
        if (account.login === login) account.scopes.push("admin:public_key", "admin:ssh_signing_key");
      });
      onEvent({ type: "completed", login });
      resolve();
    }, 4200);
  });
}

function sampleRepos(): RepoReport[] {
  const report = (name: string, folder: string, owner: string, partial: Partial<RepoReport>): RepoReport => ({
    path: `${folder}/${name}`,
    name,
    remoteUrl: `git@github.com:${owner}/${name}.git`,
    owner,
    email: "1001+octo-dev@users.noreply.github.com",
    effectiveProfileId: "personal",
    expectedProfileId: null,
    status: "ok",
    guardBypassed: false,
    ...partial,
  });
  return [
    report("dotfiles", `${HOME}/code`, "octo-dev", { expectedProfileId: "personal" }),
    report("billing-api", `${HOME}/code`, "acme-inc", {
      expectedProfileId: "work",
      status: "wrongProfile",
    }),
    report("design-system", `${HOME}/acme`, "acme-labs", {
      email: "octo@acme.example",
      effectiveProfileId: "work",
      expectedProfileId: "work",
      guardBypassed: true,
    }),
    report("side-project", `${HOME}/code`, "octo-dev", {
      email: "old-laptop@example.com",
      expectedProfileId: "personal",
      status: "localOverride",
    }),
    report("raytracer", `${HOME}/code`, "someone-else", {}),
  ];
}

let repos = sampleRepos();

export const demoBackend: SentiongBackend = {
  getEnvironment: async () => ({
    git: { found: true, path: "/usr/bin/git", version: "2.54.0" },
    gh: { found: true, path: "/opt/homebrew/bin/gh", version: "2.67.0" },
    sshKeygen: { found: true, path: "/usr/bin/ssh-keygen", version: null },
    supportsOwnerRules: true,
    homeDirectory: HOME,
  }),
  getSnapshot: async () => structuredClone(state),

  saveProfile: async (id, input: ProfileInput) => {
    await wait(350);
    if (!input.gitEmail.includes("@")) return reject("invalidProfile", `"${input.gitEmail}" is not an email address.`);
    if (id) {
      state.profiles = state.profiles.map((profile) => (profile.id === id ? { ...input, id } : profile));
    } else {
      const profile = { ...input, id: slug(input.label) };
      state.profiles.push(profile);
      state.activeProfileId ??= profile.id;
    }
    return publish();
  },
  deleteProfile: async (id) => {
    state.profiles = state.profiles.filter((profile) => profile.id !== id);
    if (state.activeProfileId === id) state.activeProfileId = state.profiles[0]?.id ?? null;
    return publish();
  },
  activateProfile: async (id) => {
    await wait(250);
    state.activeProfileId = id;
    return publish();
  },
  setGuardEnabled: async (enabled) => {
    state.guard.enabled = enabled;
    return publish();
  },
  setConnected: async (connected) => {
    state.connected = connected;
    return publish();
  },

  listGhAccounts: async () => {
    await wait(300);
    return structuredClone(accounts);
  },
  getGithubUser: async (login): Promise<GithubUser> => {
    await wait(400);
    const isWork = login.includes("acme");
    return {
      login,
      id: isWork ? 2002 : 1001,
      name: "Octo Dev",
      publicEmail: isWork ? "octo@acme.example" : null,
      noreplyEmail: `${isWork ? 2002 : 1001}+${login}@users.noreply.github.com`,
      avatarUrl: "",
      organizations: isWork ? ["acme-inc", "acme-labs"] : [],
    };
  },
  startGithubLogin: (onEvent) => fakeLogin(onEvent, "octo-new"),
  grantKeyPermissions: (login, onEvent) => fakeLogin(onEvent, login),
  cancelGithubLogin: async () => clearTimeout(loginTimer),

  listSshKeys: async () => structuredClone(keys),
  generateSshKey: async (nameHint, comment) => {
    await wait(700);
    const key: SshKey = {
      privateKeyPath: `${HOME}/.ssh/sentiong_${nameHint.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
      publicKey: "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAINewDemoKey",
      keyType: "ssh-ed25519",
      comment,
    };
    keys.push(key);
    return key;
  },
  uploadSshKey: async (login, _path, usage) => {
    await wait(800);
    const account = accounts.find((candidate) => candidate.login === login);
    const needed = usage === "authentication" ? "admin:public_key" : "admin:ssh_signing_key";
    if (!account?.scopes.includes(needed)) {
      return reject("missingScope", `GitHub account ${login} needs the "${needed}" permission for this.`);
    }
    return { alreadyPresent: false };
  },

  scanRepositories: async (_root, onEvent) => {
    for (const report of repos) {
      await wait(260);
      onEvent({ type: "found", report });
    }
    onEvent({ type: "finished", total: repos.length });
  },
  fixRepository: async (path, fix) => {
    await wait(500);
    repos = repos.map((repo) => {
      if (repo.path !== path) return repo;
      const profileId = fix.type === "pinToProfile" ? fix.profileId : (repo.effectiveProfileId ?? "personal");
      const profile = state.profiles.find((candidate) => candidate.id === profileId);
      return { ...repo, status: "ok", effectiveProfileId: profileId, email: profile?.gitEmail ?? repo.email };
    });
    return repos.find((repo) => repo.path === path)!;
  },

  onSnapshotChanged: async (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  onTrayError: async () => () => {},

  pickFolder: async (defaultPath) => `${defaultPath.replace(/\/$/, "")}/acme`,
  openUrl: async (url) => {
    window.open(url, "_blank", "noopener");
  },
  revealInFileManager: async () => {},
};
