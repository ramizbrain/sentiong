/**
 * TypeScript mirrors of the Rust models in `src-tauri/src/models.rs`.
 * Keep the two in sync: the Rust contract tests pin the JSON shape.
 */

export interface ProfileInput {
  label: string;
  color: ProfileColor;
  githubLogin: string | null;
  gitName: string;
  gitEmail: string;
  sshKeyPath: string | null;
  signing: boolean;
  folders: string[];
  owners: string[];
}

export interface Profile extends ProfileInput {
  id: string;
}

export type ProfileColor = "iris" | "cyan" | "amber" | "rose" | "lime" | "sky";

export interface GuardStatus {
  enabled: boolean;
  conflict: string | null;
}

export interface Snapshot {
  profiles: Profile[];
  activeProfileId: string | null;
  guard: GuardStatus;
  connected: boolean;
}

export interface ToolStatus {
  found: boolean;
  path: string | null;
  version: string | null;
}

export interface Environment {
  git: ToolStatus;
  gh: ToolStatus;
  sshKeygen: ToolStatus;
  supportsOwnerRules: boolean;
  homeDirectory: string;
}

export interface GhAccount {
  login: string;
  active: boolean;
  scopes: string[];
  healthy: boolean;
}

export interface GithubUser {
  login: string;
  id: number;
  name: string | null;
  publicEmail: string | null;
  noreplyEmail: string;
  avatarUrl: string;
  organizations: string[];
}

export interface SshKey {
  privateKeyPath: string;
  publicKey: string;
  keyType: string;
  comment: string | null;
}

export type KeyUsage = "authentication" | "signing";

export interface UploadOutcome {
  alreadyPresent: boolean;
}

export type LoginEvent =
  | { type: "code"; code: string; verificationUrl: string }
  | { type: "completed"; login: string | null }
  | { type: "failed"; message: string }
  | { type: "cancelled" };

export type RepoStatus = "ok" | "localOverride" | "wrongProfile" | "unmanaged";

export interface RepoReport {
  path: string;
  name: string;
  remoteUrl: string | null;
  owner: string | null;
  email: string | null;
  effectiveProfileId: string | null;
  expectedProfileId: string | null;
  status: RepoStatus;
  guardBypassed: boolean;
}

export type RepoScanEvent = { type: "found"; report: RepoReport } | { type: "finished"; total: number };

export type RepoFix = { type: "removeLocalIdentity" } | { type: "pinToProfile"; profileId: string };

/** The `{ code, message }` shape every backend error has. */
export interface BackendError {
  code: string;
  message: string;
}
