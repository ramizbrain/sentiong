/**
 * The only module components and hooks import to reach the backend. Inside the Tauri
 * app it is the real Rust backend; in a plain browser it is the in-memory demo.
 */
import { isTauri } from "@tauri-apps/api/core";

import type { SentiongBackend } from "./backend";
import { demoBackend } from "./demoBackend";
import { tauriBackend } from "./tauriBackend";

export const api: SentiongBackend = isTauri() ? tauriBackend : demoBackend;

export const isDemo = !isTauri();
