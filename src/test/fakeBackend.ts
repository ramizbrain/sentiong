import { vi } from "vitest";

import type { SentiongBackend } from "../services/backend";
import type { Snapshot } from "../types/sentiong";
import { snapshot as sampleSnapshot } from "./fixtures";

/** A backend whose every method is a spy, starting from `initial`. */
export function fakeBackend(initial: Snapshot = sampleSnapshot()) {
  let state = structuredClone(initial);
  const backend: SentiongBackend = {
    getEnvironment: vi.fn(async () => ({
      git: { found: true, path: "/usr/bin/git", version: "2.54.0" },
      gh: { found: true, path: "/usr/bin/gh", version: "2.67.0" },
      sshKeygen: { found: true, path: "/usr/bin/ssh-keygen", version: null },
      supportsOwnerRules: true,
      homeDirectory: "/home/octo",
    })),
    getSnapshot: vi.fn(async () => structuredClone(state)),
    saveProfile: vi.fn(async (_id, input) => {
      state = { ...state, profiles: [...state.profiles, { ...input, id: "new" }], activeProfileId: state.activeProfileId ?? "new" };
      return structuredClone(state);
    }),
    deleteProfile: vi.fn(async (id) => {
      state = { ...state, profiles: state.profiles.filter((profile) => profile.id !== id) };
      return structuredClone(state);
    }),
    activateProfile: vi.fn(async (id) => {
      state = { ...state, activeProfileId: id };
      return structuredClone(state);
    }),
    setGuardEnabled: vi.fn(async (enabled) => {
      state = { ...state, guard: { ...state.guard, enabled } };
      return structuredClone(state);
    }),
    setConnected: vi.fn(async (connected) => {
      state = { ...state, connected };
      return structuredClone(state);
    }),
    listGhAccounts: vi.fn(async () => [{ login: "octo", active: true, scopes: ["repo"], healthy: true }]),
    getGithubUser: vi.fn(),
    startGithubLogin: vi.fn(async () => undefined),
    grantKeyPermissions: vi.fn(async () => undefined),
    cancelGithubLogin: vi.fn(async () => undefined),
    listSshKeys: vi.fn(async () => []),
    generateSshKey: vi.fn(),
    uploadSshKey: vi.fn(),
    scanRepositories: vi.fn(async () => undefined),
    fixRepository: vi.fn(),
    onSnapshotChanged: vi.fn(async () => () => undefined),
    onTrayError: vi.fn(async () => () => undefined),
    pickFolder: vi.fn(async () => null),
    openUrl: vi.fn(async () => undefined),
    revealInFileManager: vi.fn(async () => undefined),
  };
  return backend;
}
