// Keyboard shortcuts (specs/plan.md, 3): every action has a default per system and can be
// rebound in the settings screen or the settings file ("keybindings": {"splitRight": "cmd+d"}).
// A shortcut is written as modifiers and one key joined by "+", in any case and order:
// "Cmd+Shift+T", "ctrl+alt+left". "mod" means Cmd on macOS and Ctrl on Windows.

export type Platform = "macos" | "windows" | "linux";

const MOD_ORDER = ["ctrl", "alt", "shift", "cmd"] as const;

const ALIASES: Record<string, string> = {
  control: "ctrl",
  ctl: "ctrl",
  option: "alt",
  opt: "alt",
  meta: "cmd",
  command: "cmd",
  super: "cmd",
  win: "cmd",
  plus: "=",
  esc: "escape",
  return: "enter",
  arrowleft: "left",
  arrowright: "right",
  arrowup: "up",
  arrowdown: "down",
  del: "delete",
  " ": "space",
};

/** "Shift+Cmd+t" → "shift+cmd+t" with modifiers in a fixed order, or null when it is not a shortcut. */
export function normalize(binding: string, platform: Platform): string | null {
  const parts = binding.toLowerCase().split("+").map((p) => p.trim());
  // "cmd++" ends with an empty part for the plus key itself.
  if (parts.length >= 2 && parts[parts.length - 1] === "" && parts[parts.length - 2] === "") {
    parts.splice(parts.length - 2, 2, "=");
  }
  const mods = new Set<string>();
  let key: string | null = null;
  for (let p of parts) {
    if (p === "") return null;
    p = ALIASES[p] ?? p;
    if (p === "mod") p = platform === "macos" ? "cmd" : "ctrl";
    if ((MOD_ORDER as readonly string[]).includes(p)) {
      mods.add(p);
    } else {
      if (key !== null) return null;
      key = p;
    }
  }
  if (key === null) return null;
  return [...MOD_ORDER.filter((m) => mods.has(m)), key].join("+");
}

const CODE_KEYS: Record<string, string> = {
  Equal: "=",
  Minus: "-",
  Comma: ",",
  Period: ".",
  Slash: "/",
  Backslash: "\\",
  Semicolon: ";",
  Quote: "'",
  Backquote: "`",
  BracketLeft: "[",
  BracketRight: "]",
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowUp: "up",
  ArrowDown: "down",
  Enter: "enter",
  NumpadEnter: "enter",
  Tab: "tab",
  Escape: "escape",
  Space: "space",
  Backspace: "backspace",
  Delete: "delete",
  Home: "home",
  End: "end",
  PageUp: "pageup",
  PageDown: "pagedown",
  Insert: "insert",
  NumpadAdd: "=",
  NumpadSubtract: "-",
};

export interface KeyLike {
  code: string;
  key: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}

/** The shortcut a key press is, from the physical key, so it works with any keyboard layout. */
export function fromEvent(e: KeyLike): string | null {
  let key: string | undefined;
  if (/^Key[A-Z]$/.test(e.code)) key = e.code.slice(3).toLowerCase();
  else if (/^Digit[0-9]$/.test(e.code)) key = e.code.slice(5);
  else if (/^Numpad[0-9]$/.test(e.code)) key = e.code.slice(6);
  else if (/^F([1-9]|1[0-9]|2[0-4])$/.test(e.code)) key = e.code.toLowerCase();
  else key = CODE_KEYS[e.code];
  if (!key) {
    if (["Shift", "Control", "Alt", "Meta", "CapsLock", "Fn"].includes(e.key) || !e.key) return null;
    key = ALIASES[e.key.toLowerCase()] ?? e.key.toLowerCase();
  }
  const mods: string[] = [];
  if (e.ctrlKey) mods.push("ctrl");
  if (e.altKey) mods.push("alt");
  if (e.shiftKey) mods.push("shift");
  if (e.metaKey) mods.push("cmd");
  return [...mods, key].join("+");
}

/** How a shortcut is shown: "⌘⇧T" on macOS, "Ctrl+Shift+T" on Windows. */
export function display(binding: string, platform: Platform): string {
  const n = normalize(binding, platform);
  if (!n) return "";
  const parts = n.split("+");
  const key = parts.pop() as string;
  const names: Record<string, string> = { left: "←", right: "→", up: "↑", down: "↓", enter: platform === "macos" ? "↩" : "Enter", escape: "Esc", space: "Space", tab: "Tab", backspace: "⌫", delete: "Del", pageup: "PgUp", pagedown: "PgDn" };
  const k = names[key] ?? (key.length === 1 ? key.toUpperCase() : key[0].toUpperCase() + key.slice(1));
  if (platform === "macos") {
    const sym: Record<string, string> = { ctrl: "⌃", alt: "⌥", shift: "⇧", cmd: "⌘" };
    return parts.map((p) => sym[p]).join("") + k;
  }
  const word: Record<string, string> = { ctrl: "Ctrl", alt: "Alt", shift: "Shift", cmd: "Win" };
  return [...parts.map((p) => word[p]), k].join("+");
}

/** The actions that can have a shortcut. Their names are keys of the language files ("action.<id>"). */
export const ACTIONS = [
  "newTab",
  "newWindow",
  "closePane",
  "closeTab",
  "splitRight",
  "splitDown",
  "focusLeft",
  "focusRight",
  "focusUp",
  "focusDown",
  "resizeLeft",
  "resizeRight",
  "resizeUp",
  "resizeDown",
  "zoomPane",
  "equalizePanes",
  "nextTab",
  "prevTab",
  "goToTab1",
  "goToTab2",
  "goToTab3",
  "goToTab4",
  "goToTab5",
  "goToTab6",
  "goToTab7",
  "goToTab8",
  "goToTab9",
  "moveTabLeft",
  "moveTabRight",
  "renameTab",
  "duplicateTab",
  "palette",
  "find",
  "copy",
  "paste",
  "selectAll",
  "clear",
  "scrollToTop",
  "scrollToBottom",
  "prevPrompt",
  "nextPrompt",
  "fontBigger",
  "fontSmaller",
  "fontReset",
  "openSettings",
  "openSettingsFile",
  "nextTheme",
  "checkUpdates",
  "quit",
] as const;

export type ActionId = (typeof ACTIONS)[number];

export function isAction(s: string): s is ActionId {
  return (ACTIONS as readonly string[]).includes(s);
}

const MAC: Partial<Record<ActionId, string>> = {
  newTab: "cmd+t",
  newWindow: "cmd+n",
  closePane: "cmd+w",
  closeTab: "shift+cmd+w",
  splitRight: "cmd+d",
  splitDown: "shift+cmd+d",
  focusLeft: "alt+cmd+left",
  focusRight: "alt+cmd+right",
  focusUp: "alt+cmd+up",
  focusDown: "alt+cmd+down",
  resizeLeft: "ctrl+cmd+left",
  resizeRight: "ctrl+cmd+right",
  resizeUp: "ctrl+cmd+up",
  resizeDown: "ctrl+cmd+down",
  zoomPane: "shift+cmd+enter",
  equalizePanes: "ctrl+shift+cmd+e",
  nextTab: "ctrl+tab",
  prevTab: "ctrl+shift+tab",
  moveTabLeft: "shift+cmd+[",
  moveTabRight: "shift+cmd+]",
  palette: "shift+cmd+p",
  find: "cmd+f",
  copy: "cmd+c",
  paste: "cmd+v",
  selectAll: "cmd+a",
  clear: "cmd+k",
  scrollToTop: "cmd+home",
  scrollToBottom: "cmd+end",
  prevPrompt: "cmd+up",
  nextPrompt: "cmd+down",
  fontBigger: "cmd+=",
  fontSmaller: "cmd+-",
  fontReset: "cmd+0",
  openSettings: "cmd+,",
  quit: "cmd+q",
};

const WIN: Partial<Record<ActionId, string>> = {
  newTab: "ctrl+shift+t",
  newWindow: "ctrl+shift+n",
  closePane: "ctrl+shift+w",
  closeTab: "ctrl+alt+shift+w",
  splitRight: "ctrl+shift+d",
  splitDown: "ctrl+shift+e",
  focusLeft: "ctrl+alt+left",
  focusRight: "ctrl+alt+right",
  focusUp: "ctrl+alt+up",
  focusDown: "ctrl+alt+down",
  resizeLeft: "alt+shift+left",
  resizeRight: "alt+shift+right",
  resizeUp: "alt+shift+up",
  resizeDown: "alt+shift+down",
  zoomPane: "ctrl+shift+enter",
  equalizePanes: "ctrl+alt+shift+e",
  nextTab: "ctrl+tab",
  prevTab: "ctrl+shift+tab",
  moveTabLeft: "ctrl+shift+pageup",
  moveTabRight: "ctrl+shift+pagedown",
  palette: "ctrl+shift+p",
  find: "ctrl+shift+f",
  copy: "ctrl+shift+c",
  paste: "ctrl+shift+v",
  selectAll: "ctrl+shift+a",
  clear: "ctrl+shift+k",
  scrollToTop: "ctrl+shift+home",
  scrollToBottom: "ctrl+shift+end",
  prevPrompt: "ctrl+shift+up",
  nextPrompt: "ctrl+shift+down",
  fontBigger: "ctrl+=",
  fontSmaller: "ctrl+-",
  fontReset: "ctrl+0",
  openSettings: "ctrl+,",
};

/** The default shortcuts on this system. */
export function defaultBindings(platform: Platform): Partial<Record<ActionId, string>> {
  const base = { ...(platform === "macos" ? MAC : WIN) };
  for (let i = 1; i <= 9; i++) {
    base[`goToTab${i}` as ActionId] = platform === "macos" ? `cmd+${i}` : `ctrl+alt+${i}`;
  }
  return base;
}

/**
 * The shortcut → action table: the defaults with the user's changes. A user's "" removes a
 * default; an unreadable shortcut is ignored. When two actions share a shortcut, the user's
 * choice wins over a default.
 */
export function bindingTable(user: Record<string, string>, platform: Platform): Map<string, ActionId> {
  const out = new Map<string, ActionId>();
  const effective = effectiveBindings(user, platform);
  for (const [action, binding] of Object.entries(effective)) {
    if (!binding) continue;
    const n = normalize(binding, platform);
    if (n && !out.has(n)) out.set(n, action as ActionId);
  }
  for (const [action, binding] of Object.entries(user)) {
    if (!isAction(action) || !binding) continue;
    const n = normalize(binding, platform);
    if (n) out.set(n, action);
  }
  return out;
}

/** Each action's shortcut after the user's changes ("" = none). */
export function effectiveBindings(user: Record<string, string>, platform: Platform): Record<ActionId, string> {
  const d = defaultBindings(platform);
  const out = {} as Record<ActionId, string>;
  for (const a of ACTIONS) {
    out[a] = a in user && typeof user[a] === "string" ? user[a] : (d[a] ?? "");
  }
  return out;
}

/** Actions whose shortcuts are the same as another's, for the settings screen. */
export function conflicts(user: Record<string, string>, platform: Platform): Set<ActionId> {
  const seen = new Map<string, ActionId[]>();
  for (const [a, b] of Object.entries(effectiveBindings(user, platform))) {
    const n = b ? normalize(b, platform) : null;
    if (!n) continue;
    seen.set(n, [...(seen.get(n) ?? []), a as ActionId]);
  }
  const out = new Set<ActionId>();
  for (const list of seen.values()) if (list.length > 1) list.forEach((a) => out.add(a));
  return out;
}
