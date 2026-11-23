// The app's commands (src-tauri/src/lib.rs), typed. Errors from Rust are message codes.

import { invoke, Channel } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { FoundShell } from "./settings.ts";
import type { Platform } from "./keys.ts";

export interface AppInfo {
  version: string;
  platform: Platform;
  home: string;
  settingsPath: string;
  repo: string;
}

export interface SpawnSpec {
  program: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
  shellIntegration: boolean;
  cols: number;
  rows: number;
}

export const api = {
  appInfo: () => invoke<AppInfo>("app_info"),
  shells: () => invoke<FoundShell[]>("shells_detect"),
  spawn(spec: SpawnSpec, onData: (bytes: Uint8Array) => void): Promise<number> {
    const output = new Channel<ArrayBuffer | number[]>();
    output.onmessage = (m) => onData(m instanceof ArrayBuffer ? new Uint8Array(m) : Uint8Array.from(m));
    return invoke<number>("pty_spawn", { spec, output });
  },
  write: (id: number, data: string) => invoke<void>("pty_write", { id, data }),
  resize: (id: number, cols: number, rows: number) => invoke<void>("pty_resize", { id, cols, rows }),
  kill: (id: number) => invoke<void>("pty_kill", { id }),
  busy: (ids: number[]) => invoke<number[]>("pty_busy", { ids }),
  readSettings: () => invoke<string | null>("settings_read"),
  writeSettings: (text: string) => invoke<void>("settings_write", { text }),
  openSettingsFile: () => invoke<void>("settings_open_file"),
  openUrl: (url: string) => invoke<void>("open_url", { url }),
  clipboardRead: () => invoke<string>("clipboard_read"),
  clipboardWrite: (text: string) => invoke<void>("clipboard_write", { text }),
  updateDue: () => invoke<boolean>("update_due"),
  updateCheck: () => invoke<unknown>("update_check"),
  updateInstall: () => invoke<string>("update_install"),
};

export function onPtyExit(f: (e: { id: number; code: number }) => void): Promise<UnlistenFn> {
  return listen<{ id: number; code: number }>("pty-exit", (e) => f(e.payload));
}

export function onSettingsFile(f: (text: string) => void): Promise<UnlistenFn> {
  return listen<string>("settings-file-changed", (e) => f(e.payload));
}

export function onMenu(f: (id: string) => void): Promise<UnlistenFn> {
  return listen<string>("menu-action", (e) => f(e.payload));
}
