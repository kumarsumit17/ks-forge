// Colour schemes (specs/plan.md, 3). All of these are our own; none is copied from another
// terminal. A scheme colours the terminal and, through its background, foreground and
// accent, the window around it.

export interface Theme {
  id: string;
  name: string;
  dark: boolean;
  background: string;
  foreground: string;
  cursor: string;
  selection: string;
  accent: string;
  black: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;
  brightBlack: string;
  brightRed: string;
  brightGreen: string;
  brightYellow: string;
  brightBlue: string;
  brightMagenta: string;
  brightCyan: string;
  brightWhite: string;
}

export const COLOR_KEYS = [
  "background",
  "foreground",
  "cursor",
  "selection",
  "accent",
  "black",
  "red",
  "green",
  "yellow",
  "blue",
  "magenta",
  "cyan",
  "white",
  "brightBlack",
  "brightRed",
  "brightGreen",
  "brightYellow",
  "brightBlue",
  "brightMagenta",
  "brightCyan",
  "brightWhite",
] as const;

type Colors = Omit<Theme, "id" | "name" | "dark">;

function theme(id: string, name: string, dark: boolean, c: Colors): Theme {
  return { id, name, dark, ...c };
}

export const BUILT_IN_THEMES: Theme[] = [
  theme("forge-night", "Forge Night", true, {
    background: "#14121f", foreground: "#e4e1f5", cursor: "#ffb347", selection: "#3b3560", accent: "#ff8a3d",
    black: "#1f1c2e", red: "#f0607a", green: "#7fd88f", yellow: "#f5c46b", blue: "#7aa7ff", magenta: "#c792ea", cyan: "#5fd4d0", white: "#cfcbe3",
    brightBlack: "#5d5878", brightRed: "#ff8299", brightGreen: "#a3ecaf", brightYellow: "#ffd98e", brightBlue: "#a2c1ff", brightMagenta: "#dcb3f5", brightCyan: "#8ce8e4", brightWhite: "#ffffff",
  }),
  theme("forge-day", "Forge Day", false, {
    background: "#fbfaf7", foreground: "#2b2838", cursor: "#e0662b", selection: "#e3dcf5", accent: "#d9531e",
    black: "#2b2838", red: "#c8324c", green: "#2f8a43", yellow: "#a86a00", blue: "#2d5fc4", magenta: "#8a3fb3", cyan: "#16808a", white: "#d8d4e0",
    brightBlack: "#6e6a80", brightRed: "#e04a63", brightGreen: "#3ea655", brightYellow: "#c98500", brightBlue: "#4677db", brightMagenta: "#a556cf", brightCyan: "#1f9aa5", brightWhite: "#f4f2f8",
  }),
  theme("ember", "Ember", true, {
    background: "#1a1310", foreground: "#f1e3d3", cursor: "#ff7a2f", selection: "#4a3024", accent: "#ff7a2f",
    black: "#2a1f1a", red: "#e4573d", green: "#a8c26a", yellow: "#f0a742", blue: "#6f9fd6", magenta: "#d0779e", cyan: "#6cc2ae", white: "#dccbb9",
    brightBlack: "#6b574b", brightRed: "#ff7a5c", brightGreen: "#c4dd85", brightYellow: "#ffc266", brightBlue: "#92bbeb", brightMagenta: "#ea98bb", brightCyan: "#8fdcc8", brightWhite: "#fff6ec",
  }),
  theme("anvil", "Anvil", true, {
    background: "#181a1d", foreground: "#d6dbe1", cursor: "#9fb3c8", selection: "#343a42", accent: "#7fa7d4",
    black: "#23262b", red: "#d66a6a", green: "#8fbf7f", yellow: "#d7b46a", blue: "#6f9bd1", magenta: "#b58ccf", cyan: "#6cb7b9", white: "#c3c9d1",
    brightBlack: "#5b626d", brightRed: "#ec8a8a", brightGreen: "#abd69c", brightYellow: "#ecca86", brightBlue: "#92b6e3", brightMagenta: "#cda8e2", brightCyan: "#8dd0d2", brightWhite: "#f2f5f8",
  }),
  theme("moss", "Moss", true, {
    background: "#121a15", foreground: "#dbe7dc", cursor: "#9ad66b", selection: "#2c3d31", accent: "#8fcf62",
    black: "#1b261f", red: "#e06c6c", green: "#8fcf62", yellow: "#d9c46a", blue: "#6ea9c9", magenta: "#b98bc4", cyan: "#62c2a5", white: "#c6d4c8",
    brightBlack: "#55685a", brightRed: "#f08d8d", brightGreen: "#ade783", brightYellow: "#ecd98a", brightBlue: "#8fc3df", brightMagenta: "#d0a8da", brightCyan: "#85dabf", brightWhite: "#f1f8f2",
  }),
  theme("dusk", "Dusk", true, {
    background: "#1d1a2b", foreground: "#e6def5", cursor: "#f78fb3", selection: "#3f3659", accent: "#f78fb3",
    black: "#29243d", red: "#f2778f", green: "#93d6a6", yellow: "#f3c98b", blue: "#8aa9f2", magenta: "#d79af2", cyan: "#7fd3e0", white: "#d3cbe6",
    brightBlack: "#655c85", brightRed: "#ff97ab", brightGreen: "#b2ebc1", brightYellow: "#ffdcaa", brightBlue: "#abc3ff", brightMagenta: "#e9b8ff", brightCyan: "#a2e7f1", brightWhite: "#fbf8ff",
  }),
  theme("tide", "Tide", true, {
    background: "#0f1a24", foreground: "#d7e6f2", cursor: "#4fd1c5", selection: "#23384a", accent: "#4fd1c5",
    black: "#172633", red: "#ec6f74", green: "#79c99e", yellow: "#e6c27a", blue: "#5ea8e8", magenta: "#b28de0", cyan: "#4fd1c5", white: "#c2d3e0",
    brightBlack: "#4f6577", brightRed: "#ff9094", brightGreen: "#9be0ba", brightYellow: "#f5d699", brightBlue: "#86c1f5", brightMagenta: "#caa9f0", brightCyan: "#7ee6dc", brightWhite: "#f2f8fc",
  }),
  theme("saffron", "Saffron", false, {
    background: "#fff8ec", foreground: "#3a2c1c", cursor: "#e07b00", selection: "#f5dfb8", accent: "#d96d00",
    black: "#3a2c1c", red: "#c23b2b", green: "#4b7f2a", yellow: "#a96800", blue: "#2f62a8", magenta: "#93408f", cyan: "#1d7f7a", white: "#e6d8c3",
    brightBlack: "#7d6a52", brightRed: "#dc5442", brightGreen: "#629b3c", brightYellow: "#c98200", brightBlue: "#4479c2", brightMagenta: "#ad57a9", brightCyan: "#2a9893", brightWhite: "#fffdf8",
  }),
  theme("paper", "Paper", false, {
    background: "#ffffff", foreground: "#1f2328", cursor: "#1f2328", selection: "#d6e4f5", accent: "#2f6fdf",
    black: "#1f2328", red: "#c62f37", green: "#227a3d", yellow: "#9a6700", blue: "#2f6fdf", magenta: "#8250df", cyan: "#1b7c83", white: "#d0d7de",
    brightBlack: "#6e7781", brightRed: "#e0464e", brightGreen: "#2f9a50", brightYellow: "#bf8700", brightBlue: "#4b8bf0", brightMagenta: "#a172f0", brightCyan: "#2398a0", brightWhite: "#f6f8fa",
  }),
  theme("graphite", "Graphite", true, {
    background: "#000000", foreground: "#e8e8e8", cursor: "#ffffff", selection: "#333333", accent: "#bbbbbb",
    black: "#1a1a1a", red: "#ff5f5f", green: "#5fd75f", yellow: "#ffd75f", blue: "#5fafff", magenta: "#d787ff", cyan: "#5fd7d7", white: "#d0d0d0",
    brightBlack: "#6c6c6c", brightRed: "#ff8787", brightGreen: "#87ff87", brightYellow: "#ffff87", brightBlue: "#87d7ff", brightMagenta: "#ffafff", brightCyan: "#87ffff", brightWhite: "#ffffff",
  }),
];

export const DEFAULT_DARK = "forge-night";
export const DEFAULT_LIGHT = "forge-day";

const HEX = /^#[0-9a-fA-F]{6}$/;

/** A theme read from a file or the settings, or null when it is not one. */
export function parseTheme(value: unknown): Theme | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.id !== "string" || !/^[a-z0-9][a-z0-9-]{0,40}$/.test(v.id)) return null;
  if (typeof v.name !== "string" || v.name.trim() === "" || v.name.length > 60) return null;
  const out: Record<string, unknown> = { id: v.id, name: v.name.trim(), dark: v.dark !== false };
  for (const k of COLOR_KEYS) {
    if (typeof v[k] !== "string" || !HEX.test(v[k] as string)) return null;
    out[k] = (v[k] as string).toLowerCase();
  }
  return out as unknown as Theme;
}

export function findTheme(id: string, custom: Theme[]): Theme | undefined {
  return custom.find((t) => t.id === id) ?? BUILT_IN_THEMES.find((t) => t.id === id);
}

/** Mixes two #rrggbb colours; t = 0 gives a, 1 gives b. */
export function mixColor(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return "#" + pa.map((x, i) => Math.round(x + (pb[i] - x) * t).toString(16).padStart(2, "0")).join("");
}
