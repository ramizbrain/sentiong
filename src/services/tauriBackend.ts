import { Channel, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { openUrl, revealItemInDir } from "@tauri-apps/plugin-opener";

import type { LoginEvent, RepoScanEvent, Snapshot } from "../types/sentiong";
import type { SentiongBackend } from "./backend";

function channel<T>(onEvent: (event: T) => void): Channel<T> {
  const channel = new Channel<T>();
  channel.onmessage = onEvent;
  return channel;
}

/** The real backend: each method is one Tauri command (see `src-tauri/src/commands.rs`). */
export const tauriBackend: SentiongBackend = {
  getEnvironment: () => invoke("get_environment"),
  getSnapshot: () => invoke("get_snapshot"),
  saveProfile: (id, input) => invoke("save_profile", { id, input }),
  deleteProfile: (id) => invoke("delete_profile", { id }),
  activateProfile: (id) => invoke("activate_profile", { id }),
  setGuardEnabled: (enabled) => invoke("set_guard_enabled", { enabled }),
  setConnected: (connected) => invoke("set_connected", { connected }),

  listGhAccounts: () => invoke("list_gh_accounts"),
  getGithubUser: (login) => invoke("get_github_user", { login }),
  startGithubLogin: (onEvent) => invoke("start_github_login", { onEvent: channel<LoginEvent>(onEvent) }),
  grantKeyPermissions: (login, onEvent) =>
    invoke("grant_key_permissions", { login, onEvent: channel<LoginEvent>(onEvent) }),
  cancelGithubLogin: () => invoke("cancel_github_login"),

  listSshKeys: () => invoke("list_ssh_keys"),
  generateSshKey: (nameHint, comment) => invoke("generate_ssh_key", { nameHint, comment }),
  uploadSshKey: (login, privateKeyPath, usage, title) =>
    invoke("upload_ssh_key", { login, privateKeyPath, usage, title }),

  scanRepositories: (root, onEvent) =>
    invoke("scan_repositories", { root, onEvent: channel<RepoScanEvent>(onEvent) }),
  fixRepository: (path, fix) => invoke("fix_repository", { path, fix }),

  onSnapshotChanged: (listener) => listen<Snapshot>("snapshot-changed", (event) => listener(event.payload)),
  onTrayError: (listener) => listen<string>("tray-error", (event) => listener(event.payload)),

  pickFolder: async (defaultPath) => {
    const selected = await open({ directory: true, multiple: false, defaultPath });
    return typeof selected === "string" ? selected : null;
  },
  openUrl: (url) => openUrl(url),
  revealInFileManager: (path) => revealItemInDir(path),
};
