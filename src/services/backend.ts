import type {
  Environment,
  GhAccount,
  GithubUser,
  KeyUsage,
  LoginEvent,
  ProfileInput,
  RepoFix,
  RepoReport,
  RepoScanEvent,
  Snapshot,
  SshKey,
  UploadOutcome,
} from "../types/sentiong";

/**
 * Everything the UI can ask of Sentiong. The real implementation talks to the Rust
 * backend; the demo one runs in a plain browser so the UI can be developed and
 * screenshotted without Tauri.
 */
export interface SentiongBackend {
  getEnvironment(): Promise<Environment>;
  getSnapshot(): Promise<Snapshot>;
  saveProfile(id: string | null, input: ProfileInput): Promise<Snapshot>;
  deleteProfile(id: string): Promise<Snapshot>;
  activateProfile(id: string): Promise<Snapshot>;
  setGuardEnabled(enabled: boolean): Promise<Snapshot>;
  setConnected(connected: boolean): Promise<Snapshot>;

  listGhAccounts(): Promise<GhAccount[]>;
  getGithubUser(login: string): Promise<GithubUser>;
  startGithubLogin(onEvent: (event: LoginEvent) => void): Promise<void>;
  grantKeyPermissions(login: string, onEvent: (event: LoginEvent) => void): Promise<void>;
  cancelGithubLogin(): Promise<void>;

  listSshKeys(): Promise<SshKey[]>;
  generateSshKey(nameHint: string, comment: string): Promise<SshKey>;
  uploadSshKey(login: string, privateKeyPath: string, usage: KeyUsage, title: string): Promise<UploadOutcome>;

  scanRepositories(root: string, onEvent: (event: RepoScanEvent) => void): Promise<void>;
  fixRepository(path: string, fix: RepoFix): Promise<RepoReport>;

  /** Called with a new snapshot whenever profiles change (also from the tray). */
  onSnapshotChanged(listener: (snapshot: Snapshot) => void): Promise<() => void>;
  /** Called when switching from the tray menu fails. */
  onTrayError(listener: (message: string) => void): Promise<() => void>;

  pickFolder(defaultPath: string): Promise<string | null>;
  openUrl(url: string): Promise<void>;
  revealInFileManager(path: string): Promise<void>;
}
