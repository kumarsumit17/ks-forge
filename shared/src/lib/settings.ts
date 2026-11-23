// Settings (specs/plan.md, 3): the shape of settings.json, its defaults, and the reading of
// a file someone may have edited by hand. Reading never fails: a value that is missing or
// wrong takes its default and is listed as a problem, so the app can say what it ignored.

import { parseTheme, DEFAULT_DARK, DEFAULT_LIGHT, type Theme } from "./themes.ts";
import type { Platform } from "./keys.ts";

export interface Profile {
  id: string;
  name: string;
  program: string;
  args: string[];
  /** Empty: the home folder. */
  cwd: string;
  env: Record<string, string>;
  /** A Lucide icon name from TAB_ICONS. */
  icon: string;
  /** Empty: the app's theme. */
  theme: string;
  shellIntegration: boolean;
}

export type CursorStyle = "block" | "bar" | "underline";
export type LanguageChoice = "system" | "en" | "hi";

export interface Settings {
  language: LanguageChoice;
  /** The scheme in use when not following the system. */
  theme: string;
  /** Follow the system's light or dark appearance, with the two schemes below. */
  followSystem: boolean;
  lightTheme: string;
  darkTheme: string;
  /** "" or #rrggbb: the colour of focus rings, the active tab and buttons. Empty: the theme's. */
  accent: string;
  customThemes: Theme[];
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  fontWeight: string;
  ligatures: boolean;
  cursorStyle: CursorStyle;
  cursorBlink: boolean;
  padding: number;
  scrollback: number;
  copyOnSelect: boolean;
  confirmPaste: boolean;
  confirmClose: boolean;
  rightClickPaste: boolean;
  optionIsMeta: boolean;
  newTabsInCurrentFolder: boolean;
  showTabIcons: boolean;
  defaultProfile: string;
  profiles: Profile[];
  /** Ids of found shells the user removed from the list. */
  hiddenProfiles: string[];
  keybindings: Record<string, string>;
  autoUpdate: boolean;
}

export interface FoundShell {
  id: string;
  name: string;
  program: string;
  args: string[];
  icon: string;
  default: boolean;
}

/** Icons a tab or profile can show (Lucide names). */
export const TAB_ICONS = [
  "terminal",
  "square-terminal",
  "square-chevron-right",
  "code",
  "braces",
  "server",
  "database",
  "cloud",
  "container",
  "box",
  "git-branch",
  "bug",
  "flask-conical",
  "rocket",
  "flame",
  "hammer",
  "wrench",
  "cpu",
  "globe",
  "house",
  "folder",
  "book-open",
  "music",
  "star",
  "heart",
  "zap",
  "shield",
  "fish",
] as const;

export const TAB_COLORS = ["", "#f0607a", "#f5a142", "#f5d142", "#7fd88f", "#5fd4d0", "#7aa7ff", "#c792ea", "#f78fb3", "#9aa0a6"];

export const FONT_WEIGHTS = ["normal", "300", "400", "500", "600", "bold"];

export function defaultFont(platform: Platform): string {
  return platform === "macos" ? "ui-monospace, Menlo" : "Cascadia Mono, Consolas";
}

/** The font list xterm.js gets: the user's choice, then the system's monospace font. */
export function fontStack(family: string, platform: Platform): string {
  const quote = (f: string) => {
    const t = f.trim().replace(/^["']|["']$/g, "");
    return /^[a-z-]+$/i.test(t) && (t === "monospace" || t.startsWith("ui-")) ? t : `"${t.replace(/"/g, "")}"`;
  };
  const parts = family.split(",").map((s) => s.trim()).filter(Boolean);
  const fallback = defaultFont(platform).split(",").map((s) => s.trim());
  return [...parts, ...fallback, "monospace"].filter((v, i, a) => a.indexOf(v) === i).map(quote).join(", ");
}

export function defaults(platform: Platform): Settings {
  return {
    language: "system",
    theme: DEFAULT_DARK,
    followSystem: true,
    lightTheme: DEFAULT_LIGHT,
    darkTheme: DEFAULT_DARK,
    accent: "",
    customThemes: [],
    fontFamily: defaultFont(platform),
    fontSize: 13,
    lineHeight: 1.2,
    fontWeight: "normal",
    ligatures: true,
    cursorStyle: "block",
    cursorBlink: true,
    padding: 8,
    scrollback: 10000,
    copyOnSelect: false,
    confirmPaste: true,
    confirmClose: true,
    rightClickPaste: platform === "windows",
    optionIsMeta: false,
    newTabsInCurrentFolder: true,
    showTabIcons: true,
    defaultProfile: "",
    profiles: [],
    hiddenProfiles: [],
    keybindings: {},
    autoUpdate: true,
  };
}

export const LIMITS = {
  fontSize: [6, 48],
  lineHeight: [0.8, 2.5],
  padding: [0, 48],
  scrollback: [0, 200000],
} as const;

export function profileFromShell(s: FoundShell): Profile {
  return { id: s.id, name: s.name, program: s.program, args: [...s.args], cwd: "", env: {}, icon: s.icon || "terminal", theme: "", shellIntegration: true };
}

const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

function parseProfile(v: unknown): Profile | null {
  if (typeof v !== "object" || v === null) return null;
  const p = v as Record<string, unknown>;
  if (typeof p.id !== "string" || !ID.test(p.id)) return null;
  if (typeof p.program !== "string" || p.program.trim() === "") return null;
  const env: Record<string, string> = {};
  if (typeof p.env === "object" && p.env !== null) {
    for (const [k, val] of Object.entries(p.env as Record<string, unknown>)) {
      if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(k) && typeof val === "string") env[k] = val;
    }
  }
  return {
    id: p.id,
    name: typeof p.name === "string" && p.name.trim() ? p.name.trim().slice(0, 60) : p.id,
    program: p.program.trim(),
    args: Array.isArray(p.args) ? p.args.filter((a): a is string => typeof a === "string") : [],
    cwd: typeof p.cwd === "string" ? p.cwd : "",
    env,
    icon: typeof p.icon === "string" && (TAB_ICONS as readonly string[]).includes(p.icon) ? p.icon : "terminal",
    theme: typeof p.theme === "string" ? p.theme : "",
    shellIntegration: p.shellIntegration !== false,
  };
}

export interface Loaded {
  settings: Settings;
  /** The names of the settings that were ignored, for the "some settings were ignored" note. */
  problems: string[];
}

/**
 * Reads settings from parsed JSON (an object, or anything else from a broken file), adds the
 * shells found on this computer that are not yet in the list, and fills in defaults.
 */
export function normalize(raw: unknown, found: FoundShell[], platform: Platform): Loaded {
  const d = defaults(platform);
  const problems: string[] = [];
  const src = typeof raw === "object" && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const out = { ...d } as Settings;
  const take = <K extends keyof Settings>(key: K, ok: (v: unknown) => boolean, map: (v: unknown) => Settings[K] = (v) => v as Settings[K]) => {
    if (!(key in src)) return;
    if (ok(src[key])) out[key] = map(src[key]);
    else problems.push(key);
  };
  const isBool = (v: unknown) => typeof v === "boolean";
  const isStr = (v: unknown) => typeof v === "string";
  const inRange = (lo: number, hi: number) => (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;

  take("language", (v) => v === "system" || v === "en" || v === "hi");
  take("theme", isStr);
  take("followSystem", isBool);
  take("lightTheme", isStr);
  take("darkTheme", isStr);
  take("accent", (v) => v === "" || (typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v)));
  take("fontFamily", (v) => typeof v === "string" && v.trim() !== "" && v.length < 300, (v) => (v as string).trim());
  take("fontSize", inRange(...LIMITS.fontSize));
  take("lineHeight", inRange(...LIMITS.lineHeight));
  take("fontWeight", (v) => typeof v === "string" && FONT_WEIGHTS.includes(v));
  take("ligatures", isBool);
  take("cursorStyle", (v) => v === "block" || v === "bar" || v === "underline");
  take("cursorBlink", isBool);
  take("padding", inRange(...LIMITS.padding), (v) => Math.round(v as number));
  take("scrollback", inRange(...LIMITS.scrollback), (v) => Math.round(v as number));
  for (const k of ["copyOnSelect", "confirmPaste", "confirmClose", "rightClickPaste", "optionIsMeta", "newTabsInCurrentFolder", "showTabIcons", "autoUpdate"] as const) {
    take(k, isBool);
  }
  take("defaultProfile", isStr);
  take("hiddenProfiles", (v) => Array.isArray(v), (v) => (v as unknown[]).filter((x): x is string => typeof x === "string"));
  take("keybindings", (v) => typeof v === "object" && v !== null && !Array.isArray(v), (v) => {
    const kb: Record<string, string> = {};
    for (const [a, b] of Object.entries(v as Record<string, unknown>)) if (typeof b === "string") kb[a] = b;
    return kb;
  });

  if ("customThemes" in src) {
    if (Array.isArray(src.customThemes)) {
      const themes: Theme[] = [];
      for (const t of src.customThemes) {
        const p = parseTheme(t);
        if (p && !themes.some((x) => x.id === p.id)) themes.push(p);
        else problems.push("customThemes");
      }
      out.customThemes = themes;
    } else problems.push("customThemes");
  }

  const profiles: Profile[] = [];
  if ("profiles" in src) {
    if (Array.isArray(src.profiles)) {
      for (const p of src.profiles) {
        const parsed = parseProfile(p);
        if (parsed && !profiles.some((x) => x.id === parsed.id)) profiles.push(parsed);
        else problems.push("profiles");
      }
    } else problems.push("profiles");
  }
  for (const s of found) {
    if (!profiles.some((p) => p.id === s.id) && !out.hiddenProfiles.includes(s.id)) profiles.push(profileFromShell(s));
  }
  out.profiles = profiles;
  if (!profiles.some((p) => p.id === out.defaultProfile)) {
    out.defaultProfile = found.find((s) => s.default && profiles.some((p) => p.id === s.id))?.id ?? profiles[0]?.id ?? "";
  }
  return { settings: out, problems: [...new Set(problems)] };
}

/** Reads the settings file's text. A file that is not JSON gives null, so the app keeps what it has. */
export function parseFile(text: string | null): unknown | null {
  if (text === null || text.trim() === "") return {};
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** The text written to settings.json. */
export function serialize(s: Settings): string {
  return JSON.stringify(s, null, 2) + "\n";
}

/** The scheme in use, given the system's appearance. */
export function activeThemeId(s: Settings, systemDark: boolean): string {
  if (s.followSystem) return systemDark ? s.darkTheme : s.lightTheme;
  return s.theme;
}
