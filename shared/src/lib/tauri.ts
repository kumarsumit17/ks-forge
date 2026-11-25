// The app's commands (src-tauri/src/lib.rs), typed. Errors from Rust are message codes.

import { invoke, Channel } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import type { FoundShell } from "./settings.ts";
import type { Platform } from "./keys.ts";

export interface AppInfo {
  version: string;
  platform: Platform;
  home: string;
  settingsPath: string;
  repo: string;
}

/** What a window was opened with (src-tauri/src/wins.rs). */
export interface WindowRequest {
  cwd: string | null;
  profile: string | null;
  layout: unknown;
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

/** What arrived over the output channels, for the self-test's report. */
export const ipcStats = { messages: 0, bytes: 0, firstType: "" };

function describe(m: unknown): string {
  if (m === null) return "null";
  if (typeof m !== "object") return typeof m;
  return Object.prototype.toString.call(m);
}

/** Raw channel data arrives as an ArrayBuffer in WebKit; other web views may hand a typed
 *  array, a plain array of numbers, or an object with numbered keys. */
export function toBytes(m: unknown): Uint8Array {
  if (m instanceof ArrayBuffer || Object.prototype.toString.call(m) === "[object ArrayBuffer]") return new Uint8Array(m as ArrayBuffer);
  if (ArrayBuffer.isView(m)) return new Uint8Array(m.buffer, m.byteOffset, m.byteLength);
  if (Array.isArray(m)) return Uint8Array.from(m as number[]);
  if (typeof m === "string") return new TextEncoder().encode(m);
  if (m && typeof m === "object") return Uint8Array.from(Object.values(m as Record<string, number>));
  return new Uint8Array();
}

export const api = {
  appInfo: () => invoke<AppInfo>("app_info"),
  shells: () => invoke<FoundShell[]>("shells_detect"),
  spawn(spec: SpawnSpec, onData: (bytes: Uint8Array) => void): Promise<number> {
    const output = new Channel<unknown>();
    output.onmessage = (m) => {
      const bytes = toBytes(m);
      ipcStats.messages++;
      ipcStats.bytes += bytes.length;
      if (!ipcStats.firstType) ipcStats.firstType = describe(m);
      onData(bytes);
    };
    return invoke<number>("pty_spawn", { spec, output });
  },
  write: (id: number, data: string) => invoke<void>("pty_write", { id, data }),
  resize: (id: number, cols: number, rows: number) => invoke<void>("pty_resize", { id, cols, rows }),
  kill: (id: number) => invoke<void>("pty_kill", { id }),
  busy: (ids: number[]) => invoke<number[]>("pty_busy", { ids }),
  busyAny: () => invoke<boolean>("pty_busy_any"),
  windowRequest: () => invoke<WindowRequest>("window_request"),
  newWindow: (cwd?: string, profile?: string) => invoke<string>("window_new", { cwd: cwd || null, profile: profile || null }),
  saveSession: (layout: unknown) => invoke<void>("session_save", { layout }),
  quitApp: () => invoke<void>("app_quit"),
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

/** Menu commands go to the window in front only. */
export function onMenu(f: (id: string) => void): Promise<UnlistenFn> {
  return getCurrentWebviewWindow().listen<string>("menu-action", (e) => f(e.payload));
}

/** Another window changed the settings. */
export function onSettingsSynced(f: (text: string) => void): Promise<UnlistenFn> {
  return listen<string>("settings-synced", (e) => f(e.payload));
}
