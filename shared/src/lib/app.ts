// The app's state and everything the user can do: tabs, split panes, the overlays (command
// palette, settings, find), dialogs, the settings file and app updates. React components
// read the state through `useApp` and call the methods; terminal sessions live beside the
// state, keyed by pane id.

import { getCurrentWindow } from "@tauri-apps/api/window";
import { createUpdateStore, MAC_QUIT_AFTER_MS, type CheckResult, type Opened, type UpdateStore } from "ks-utility";
import { api, onMenu, onOpenRequest, onPtyExit, onSettingsFile, onSettingsSynced, type AppInfo } from "./tauri.ts";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import { activeThemeId, LIMITS, normalize, parseFile, serialize, type FoundShell, type Profile, type Settings } from "./settings.ts";
import { BUILT_IN_THEMES, DEFAULT_DARK, findTheme, type Theme } from "./themes.ts";
import * as L from "./layout.ts";
import { ACTIONS, bindingTable, effectiveBindings, fromEvent, isAction, normalize as normalizeKey, type ActionId, type Platform } from "./keys.ts";
import { Session } from "./session.ts";
import { parseLayout, renameLeaves, type SavedLayout, type SavedPane } from "./layoutStore.ts";
import { baseName, pasteWarning } from "./text.ts";
import { errorText, isMsg, setLanguage, t, tk, type TextKey } from "./i18n.ts";

export interface Tab {
  id: string;
  root: L.Node;
  active: string;
  zoomed: string | null;
  /** Set by the user; empty: the terminal's own title. */
  title: string;
  icon: string;
  color: string;
}

export interface Dialog {
  title: string;
  body: string;
  /** Text shown in a box, such as the lines about to be pasted. */
  detail?: string;
  ok: string;
  cancel?: string;
  danger?: boolean;
  resolve(ok: boolean): void;
}

export interface MenuItem {
  label: string;
  shortcut?: string;
  run(): void;
  danger?: boolean;
}

export interface Menu {
  x: number;
  y: number;
  items: (MenuItem | "separator")[];
}

export type Overlay = "none" | "palette" | "settings";

export interface State {
  ready: boolean;
  info: AppInfo | null;
  platform: Platform;
  settings: Settings;
  /** Settings that were ignored when the file was read. */
  problems: string[];
  /** The file is not valid JSON; the app keeps its last good settings. */
  fileBroken: boolean;
  found: FoundShell[];
  systemDark: boolean;
  tabs: Tab[];
  activeTab: string;
  overlay: Overlay;
  settingsSection: string;
  /** Find bar open in the active pane. */
  searching: boolean;
  dialog: Dialog | null;
  menu: Menu | null;
  renaming: string | null;
  toast: string | null;
  fontDelta: number;
  /** Bumped when a session's title, folder or state changes, so tab titles redraw. */
  revision: number;
}

let counter = 0;
const newId = (prefix: string) => `${prefix}${Date.now().toString(36)}${(++counter).toString(36)}`;

function guessPlatform(): Platform {
  return /Mac/.test(navigator.platform) ? "macos" : /Win/.test(navigator.platform) ? "windows" : "linux";
}

export class App {
  state: State;
  readonly sessions = new Map<string, Session>();
  readonly updates: UpdateStore;
  private listeners = new Set<() => void>();
  private byPty = new Map<number, Session>();
  private saveTimer = 0;
  private toastTimer = 0;
  private table = new Map<string, ActionId>();

  constructor() {
    const platform = guessPlatform();
    this.state = {
      ready: false,
      info: null,
      platform,
      settings: normalize({}, [], platform).settings,
      problems: [],
      fileBroken: false,
      found: [],
      systemDark: matchMedia("(prefers-color-scheme: dark)").matches,
      tabs: [],
      activeTab: "",
      overlay: "none",
      settingsSection: "general",
      searching: false,
      dialog: null,
      menu: null,
      renaming: null,
      toast: null,
      fontDelta: 0,
      revision: 0,
    };
    this.updates = createUpdateStore(
      {
        check: () => api.updateCheck() as Promise<CheckResult>,
        install: async () => (await api.updateInstall()) as Opened,
        errorNote: (e, during) =>
          isMsg(e) ? { key: e.code, params: e.params } : { key: during === "check" ? "common.appUpdate.checkFailed" : "common.appUpdate.installFailed", params: { detail: errorText(e) } },
      },
      "KS Forge",
    );
  }

  // ----- State plumbing -----

  getState = () => this.state;

  subscribe = (f: () => void) => {
    this.listeners.add(f);
    return () => {
      this.listeners.delete(f);
    };
  };

  private set(patch: Partial<State>): void {
    this.state = { ...this.state, ...patch };
    for (const f of [...this.listeners]) f();
  }

  private bump(): void {
    this.set({ revision: this.state.revision + 1 });
  }

  // ----- Start-up -----

  async start(): Promise<void> {
    const [info, found, text] = await Promise.all([api.appInfo(), api.shells().catch(() => []), api.readSettings().catch(() => null)]);
    const raw = parseFile(text);
    const { settings, problems } = normalize(raw ?? {}, found, info.platform);
    this.table = bindingTable(settings.keybindings, info.platform);
    setLanguage(settings.language);
    this.set({ info, platform: info.platform, found, settings, problems, fileBroken: raw === null });
    this.applyChrome();
    if (text === null) this.save();
    this.updates.setCurrent(info.version);

    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
      this.set({ systemDark: e.matches });
      this.applySettingsToSessions();
    });
    window.addEventListener("keydown", (e) => this.onKey(e), true);
    void onPtyExit(({ id, code }) => this.byPty.get(id)?.handleExit(code));
    void onSettingsFile((text) => this.onSettingsFileChanged(text));
    void onSettingsSynced((text) => this.onSettingsFileChanged(text, false));
    void onMenu((id) => {
      if (id === "secureKeyboardEntry") this.updateSettings({ secureKeyboardEntry: !this.state.settings.secureKeyboardEntry });
      else if (isAction(id)) void this.run(id);
    });
    void onOpenRequest((r) => {
      this.newTab(r.profile ?? undefined, r.cwd ?? undefined);
    });
    // Files dropped on a pane type their paths there, quoted for the shell.
    void getCurrentWebview().onDragDropEvent((e) => {
      if (e.payload.type !== "drop" || e.payload.paths.length === 0) return;
      const ratio = window.devicePixelRatio || 1;
      const at = document.elementFromPoint(e.payload.position.x / ratio, e.payload.position.y / ratio);
      const host = at?.closest("[data-pane]")?.getAttribute("data-pane");
      const session = (host && this.sessions.get(host)) || this.session;
      session?.typeText(e.payload.paths.map((p) => quotePath(p, this.state.platform)).join(" ") + " ");
    });
    window.addEventListener("focus", () => void this.refreshScreenReader());
    void getCurrentWindow().onCloseRequested(async (e) => {
      e.preventDefault();
      await this.closeWindow();
    });

    const request = await api.windowRequest().catch(() => null);
    if (!(request?.layout && this.restore(request.layout))) {
      this.newTab(request?.profile ?? undefined, request?.cwd ?? undefined);
    }
    this.set({ ready: true });
    this.subscribe(() => this.scheduleSessionSave());
    void this.syncSystem();
    void getCurrentWindow().show();
    this.scheduleUpdateChecks();
  }

  private scheduleUpdateChecks(): void {
    const tick = async () => {
      if (!this.state.settings.autoUpdate) return;
      try {
        if (await api.updateDue()) await this.updates.checkNow();
      } catch {
        // Automatic checks fail silently (ks-utility specs/app-update.md).
      }
    };
    setTimeout(tick, 10_000);
    setInterval(tick, 60 * 60 * 1000);
  }

  // ----- Settings -----

  get theme(): Theme {
    return this.themeFor("");
  }

  themeFor(override: string): Theme {
    const s = this.state.settings;
    const id = override || activeThemeId(s, this.state.systemDark);
    return findTheme(id, s.customThemes) ?? findTheme(DEFAULT_DARK, [])!;
  }

  allThemes(): Theme[] {
    return [...BUILT_IN_THEMES, ...this.state.settings.customThemes];
  }

  /** The settings with the font zoom (Cmd + / −) applied. */
  private effective(): Settings {
    const s = this.state.settings;
    const size = Math.min(LIMITS.fontSize[1], Math.max(LIMITS.fontSize[0], s.fontSize + this.state.fontDelta));
    return { ...s, fontSize: size };
  }

  updateSettings(patch: Partial<Settings>): void {
    const settings = { ...this.state.settings, ...patch };
    if (patch.profiles && !settings.profiles.some((p) => p.id === settings.defaultProfile)) {
      settings.defaultProfile = settings.profiles[0]?.id ?? "";
    }
    this.table = bindingTable(settings.keybindings, this.state.platform);
    if (patch.language) setLanguage(patch.language);
    this.set({ settings, fileBroken: false, problems: [] });
    this.applyChrome();
    this.applySettingsToSessions();
    this.save();
    void this.syncSystem();
  }

  private save(): void {
    clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => {
      api.writeSettings(serialize(this.state.settings)).catch((e) => this.showToast(errorText(e)));
    }, 250);
  }

  private onSettingsFileChanged(text: string, toast = true): void {
    const raw = parseFile(text);
    if (raw === null) {
      this.set({ fileBroken: true });
      return;
    }
    const { settings, problems } = normalize(raw, this.state.found, this.state.platform);
    this.table = bindingTable(settings.keybindings, this.state.platform);
    setLanguage(settings.language);
    this.set({ settings, problems, fileBroken: false });
    this.applyChrome();
    this.applySettingsToSessions();
    void this.syncSystem();
    if (toast) this.showToast(t("toast.settingsReloaded"));
  }

  private applySettingsToSessions(): void {
    const s = this.effective();
    for (const session of this.sessions.values()) {
      const profile = s.profiles.find((p) => p.id === session.profile.id) ?? session.profile;
      session.update(s, this.themeFor(profile.theme), profile);
    }
  }

  /** The window's colours follow the terminal theme. */
  private applyChrome(): void {
    const th = this.theme;
    const accent = this.state.settings.accent || th.accent;
    const root = document.documentElement;
    root.style.setProperty("--bg", th.background);
    root.style.setProperty("--fg", th.foreground);
    root.style.setProperty("--accent", accent);
    root.style.setProperty("--danger", th.red);
    root.style.setProperty("--ok", th.green);
    root.style.colorScheme = th.dark ? "dark" : "light";
    root.dataset.dark = String(th.dark);
    root.dataset.platform = this.state.platform;
    root.style.setProperty("--padding", `${this.state.settings.padding}px`);
    const s = this.state.settings;
    root.style.setProperty("--bg-alpha", String(s.backgroundBlur ? s.backgroundOpacity : 1));
    root.dataset.blur = String(s.backgroundBlur);
  }

  // ----- Tabs and panes -----

  get tab(): Tab | undefined {
    return this.state.tabs.find((x) => x.id === this.state.activeTab);
  }

  get session(): Session | undefined {
    const tab = this.tab;
    return tab ? this.sessions.get(tab.active) : undefined;
  }

  profile(id?: string): Profile | undefined {
    const s = this.state.settings;
    return s.profiles.find((p) => p.id === (id || s.defaultProfile)) ?? s.profiles[0];
  }

  private makeSession(profile: Profile, cwd: string): Session {
    const id = newId("p");
    const session = new Session(id, profile, cwd, this.effective(), this.themeFor(profile.theme), this.state.platform, {
      changed: () => {
        if (session.ptyId !== null) this.byPty.set(session.ptyId, session);
        this.bump();
        this.updateWindowTitle();
      },
      exited: (code) => {
        for (const [k, v] of this.byPty) if (v === session) this.byPty.delete(k);
        if (code === 0) void this.closePane(id, true);
        else {
          session.writeNote(t("pane.exited", { code }));
          this.bump();
        }
      },
      openLink: (url) => api.openUrl(url).catch((e) => this.showToast(errorText(e))),
      confirmPaste: (text) => this.confirmPaste(text),
      focused: () => this.focusPane(id),
      contextMenu: (x, y) => this.paneMenu(id, x, y),
      error: (e) => this.showToast(errorText(e)),
      commandFinished: (ms, code) => void this.commandFinished(session, ms, code),
    });
    this.sessions.set(id, session);
    if (this.screenReader) session.setScreenReaderMode(true);
    return session;
  }

  private currentFolder(): string {
    return this.state.settings.newTabsInCurrentFolder ? (this.session?.cwd ?? "") : "";
  }

  newTab(profileId?: string, cwd?: string): void {
    const profile = this.profile(profileId);
    if (!profile) {
      this.showToast(t("error.noProfile"));
      return;
    }
    // Windows: an administrator profile opens in an elevated copy of the app (UAC asks).
    if (profile.runAsAdmin && this.state.platform === "windows" && !this.state.info?.elevated) {
      void api.runElevated(profile.id).then((ok) => {
        if (!ok) this.showToast(t("error.elevate"));
      });
      return;
    }
    const session = this.makeSession(profile, cwd ?? this.currentFolder());
    const tab: Tab = { id: newId("t"), root: L.leaf(session.id), active: session.id, zoomed: null, title: "", icon: profile.icon, color: "" };
    this.set({ tabs: [...this.state.tabs, tab], activeTab: tab.id, searching: false });
    this.focusSoon();
  }

  duplicateTab(tabId = this.state.activeTab): void {
    const tab = this.state.tabs.find((x) => x.id === tabId);
    const s = tab && this.sessions.get(tab.active);
    if (!tab || !s) return;
    const session = this.makeSession(s.profile, s.cwd);
    const copy: Tab = { ...tab, id: newId("t"), root: L.leaf(session.id), active: session.id, zoomed: null };
    const i = this.state.tabs.indexOf(tab);
    const tabs = [...this.state.tabs];
    tabs.splice(i + 1, 0, copy);
    this.set({ tabs, activeTab: copy.id });
    this.focusSoon();
  }

  private patchTab(id: string, patch: Partial<Tab>): void {
    this.set({ tabs: this.state.tabs.map((x) => (x.id === id ? { ...x, ...patch } : x)) });
  }

  selectTab(id: string): void {
    if (!this.state.tabs.some((x) => x.id === id)) return;
    this.set({ activeTab: id, searching: false });
    this.focusSoon();
    this.updateWindowTitle();
  }

  moveTab(from: number, to: number): void {
    const tabs = [...this.state.tabs];
    if (from < 0 || from >= tabs.length || to < 0 || to >= tabs.length || from === to) return;
    const [x] = tabs.splice(from, 1);
    tabs.splice(to, 0, x);
    this.set({ tabs });
  }

  renameTab(id: string, title: string): void {
    this.patchTab(id, { title: title.trim().slice(0, 80) });
    this.set({ renaming: null });
    this.focusSoon();
  }

  setTabLook(id: string, look: { icon?: string; color?: string }): void {
    this.patchTab(id, look);
  }

  split(direction: L.Direction): void {
    const tab = this.tab;
    const current = this.session;
    if (!tab || !current) return;
    const session = this.makeSession(current.profile, this.state.settings.newTabsInCurrentFolder ? current.cwd : "");
    const root = L.split(tab.root, tab.active, direction, session.id, newId("s"));
    this.patchTab(tab.id, { root, active: session.id, zoomed: null });
    this.focusSoon();
  }

  focusPane(id: string): void {
    const tab = this.state.tabs.find((x) => L.contains(x.root, id));
    if (!tab) return;
    if (tab.active !== id || this.state.activeTab !== tab.id) {
      this.set({ tabs: this.state.tabs.map((x) => (x.id === tab.id ? { ...x, active: id } : x)), activeTab: tab.id });
      this.updateWindowTitle();
    }
  }

  private moveFocus(side: L.Side): void {
    const tab = this.tab;
    if (!tab || tab.zoomed) return;
    const next = L.neighbour(tab.root, tab.active, side);
    if (next) {
      this.patchTab(tab.id, { active: next });
      this.focusSoon();
    }
  }

  private resizePane(side: L.Side): void {
    const tab = this.tab;
    if (!tab || tab.zoomed) return;
    this.patchTab(tab.id, { root: L.resize(tab.root, tab.active, side, 0.05) });
  }

  setSizes(tabId: string, splitId: string, sizes: number[]): void {
    const tab = this.state.tabs.find((x) => x.id === tabId);
    if (tab) this.patchTab(tabId, { root: L.setSizes(tab.root, splitId, sizes) });
  }

  private toggleZoom(): void {
    const tab = this.tab;
    if (!tab) return;
    this.patchTab(tab.id, { zoomed: tab.zoomed ? null : tab.active });
    this.focusSoon();
  }

  /** Closes a pane, asking first when a program is running in it. */
  async closePane(id: string, force = false): Promise<void> {
    const session = this.sessions.get(id);
    if (!force && session && !(await this.confirmClose([session]))) return;
    const tab = this.state.tabs.find((x) => L.contains(x.root, id));
    session?.dispose();
    this.sessions.delete(id);
    if (!tab) return;
    const root = L.remove(tab.root, id);
    if (!root) {
      this.removeTab(tab.id);
      return;
    }
    const active = tab.active === id ? (L.leaves(root)[0] ?? "") : tab.active;
    this.patchTab(tab.id, { root, active, zoomed: null });
    this.focusSoon();
  }

  async closeTab(id = this.state.activeTab): Promise<void> {
    const tab = this.state.tabs.find((x) => x.id === id);
    if (!tab) return;
    const sessions = L.leaves(tab.root).map((p) => this.sessions.get(p)).filter((s): s is Session => !!s);
    if (!(await this.confirmClose(sessions))) return;
    for (const s of sessions) {
      s.dispose();
      this.sessions.delete(s.id);
    }
    this.removeTab(id);
  }

  private removeTab(id: string): void {
    const i = this.state.tabs.findIndex((x) => x.id === id);
    const tabs = this.state.tabs.filter((x) => x.id !== id);
    if (tabs.length === 0) {
      this.set({ tabs });
      void getCurrentWindow().destroy();
      return;
    }
    const activeTab = this.state.activeTab === id ? tabs[Math.min(i, tabs.length - 1)].id : this.state.activeTab;
    this.set({ tabs, activeTab, searching: false });
    this.focusSoon();
    this.updateWindowTitle();
  }

  private async confirmClose(sessions: Session[]): Promise<boolean> {
    if (!this.state.settings.confirmClose) return true;
    const ids = sessions.map((s) => s.ptyId).filter((x): x is number => x !== null);
    const busy = ids.length ? await api.busy(ids).catch(() => []) : [];
    if (busy.length === 0) return true;
    return this.confirm({ title: t("confirm.closeTitle"), body: t("confirm.closeBody"), ok: t("confirm.closeOk"), danger: true });
  }

  /** Closes this window, asking first when a program is running in one of its panes. */
  async closeWindow(): Promise<void> {
    const all = [...this.sessions.values()];
    if (!(await this.confirmClose(all))) return;
    for (const s of all) s.kill();
    await getCurrentWindow().destroy();
  }

  /**
   * The update's installer is open (ks-utility `install::open`): the app quits so the copy can be
   * replaced. Windows: at once. macOS ("macos-closes"): after MAC_QUIT_AFTER_MS, while the update
   * store shows that it now closes, since Finder cannot replace a running app. The session is saved first; running programs are not asked
   * about, since the update cannot wait for them.
   */
  afterUpdateOpened(opened: string): void {
    const quit = async () => {
      await this.saveSessionNow();
      await api.quitApp();
    };
    // The update store already shows openedMacCloses for "macos-closes".
    setTimeout(() => void quit(), opened === "macos-closes" ? MAC_QUIT_AFTER_MS : 1000);
  }

  /** Quits the app: every window, asking first when a program is running in any of them. */
  async quit(): Promise<void> {
    if (this.state.settings.confirmClose && (await api.busyAny().catch(() => false))) {
      const ok = await this.confirm({ title: t("confirm.closeTitle"), body: t("confirm.quitBody"), ok: t("confirm.quitOk"), danger: true });
      if (!ok) return;
    }
    await this.saveSessionNow();
    await api.quitApp();
  }

  // ----- The system: menus, Dock / jump list, blur, secure input, screen readers -----

  private systemSig = "";
  private screenReader = false;

  /** Hands what the system shows to Rust, when it changed. */
  private async syncSystem(): Promise<void> {
    const s = this.state.settings;
    const platform = this.state.platform;
    const shortcuts = effectiveBindings(s.keybindings, platform);
    const text: Record<string, { label: string; shortcut: string }> = {};
    for (const a of ACTIONS) text[a] = { label: tk(`action.${a}`), shortcut: normalizeKey(shortcuts[a] || "", platform) ?? "" };
    for (const k of ["about", "services", "hide", "hideOthers", "showAll", "shell", "edit", "view", "window", "minimize", "zoom", "fullscreen", "secureKeyboardEntry"]) {
      text[`menu.${k}`] = { label: tk(`menu.${k}`), shortcut: "" };
    }
    text.copy = { label: t("common.copy"), shortcut: "" };
    text.paste = { label: t("common.paste"), shortcut: "" };
    const profiles: [string, string][] = s.profiles.map((p) => [p.id, p.name]);
    const sig = JSON.stringify([text, s.secureKeyboardEntry, s.backgroundBlur, profiles, s.screenReaderMode]);
    if (sig === this.systemSig) return;
    this.systemSig = sig;
    const calls: Promise<unknown>[] = [
      api.profilesChanged(profiles, t("action.newWindow"), t("action.newTab")),
      api.setBlur(s.backgroundBlur),
      this.refreshScreenReader(),
    ];
    if (platform === "macos") calls.push(api.menuUpdate(text, s.secureKeyboardEntry), api.secureInput(s.secureKeyboardEntry));
    await Promise.all(calls.map((c) => c.catch(() => {})));
  }

  /** Screen reader mode: on, off, or following VoiceOver / Narrator / NVDA. */
  private async refreshScreenReader(): Promise<void> {
    const mode = this.state.settings.screenReaderMode;
    const on = mode === "on" || (mode === "auto" && (await api.screenReaderActive().catch(() => false)));
    if (on === this.screenReader) return;
    this.screenReader = on;
    for (const x of this.sessions.values()) x.setScreenReaderMode(on);
  }

  /** "Command finished": a command ran 10 s or more and the window is not in front. */
  private async commandFinished(session: Session, ms: number, code: number): Promise<void> {
    if (!this.state.settings.notifyLongCommands || ms < 10_000 || document.hasFocus()) return;
    try {
      let ok = await isPermissionGranted();
      if (!ok) ok = (await requestPermission()) === "granted";
      if (!ok) return;
      const tab = this.state.tabs.find((x) => L.contains(x.root, session.id));
      const seconds = Math.round(ms / 1000);
      sendNotification({
        title: tab ? this.tabTitle(tab) : "KS Forge",
        body: code === 0 ? t("notify.done", { seconds }) : t("notify.failed", { seconds, code }),
      });
    } catch {
      // Notifications are a convenience; nothing to do if the system refuses.
    }
  }

  // ----- Session restore -----

  private sessionTimer = 0;

  private scheduleSessionSave(): void {
    clearTimeout(this.sessionTimer);
    this.sessionTimer = window.setTimeout(() => void this.saveSessionNow(), 600);
  }

  /** This window's layout: tabs, panes with their profile and folder, titles and looks. */
  layout(): SavedLayout {
    const panes: Record<string, SavedPane> = {};
    for (const [id, s] of this.sessions) panes[id] = { profile: s.profile.id, cwd: s.cwd };
    return {
      version: 1,
      activeTab: Math.max(0, this.state.tabs.findIndex((x) => x.id === this.state.activeTab)),
      tabs: this.state.tabs.map((x) => ({ root: x.root, active: x.active, title: x.title, icon: x.icon, color: x.color })),
      panes,
    };
  }

  private async saveSessionNow(): Promise<void> {
    if (!this.state.ready || this.state.tabs.length === 0) return;
    await api.saveSession(this.layout()).catch(() => {});
  }

  /** Rebuilds a saved layout with new shells in the saved folders. False when it is unusable. */
  restore(raw: unknown): boolean {
    const saved = parseLayout(raw);
    if (!saved) return false;
    const tabs: Tab[] = [];
    for (const st of saved.tabs) {
      const ids = new Map<string, string>();
      for (const old of L.leaves(st.root)) {
        const pane = saved.panes[old];
        const profile = this.profile(pane?.profile);
        if (!profile) continue;
        ids.set(old, this.makeSession(profile, pane?.cwd ?? "").id);
      }
      const root = renameLeaves(st.root, ids, () => newId("s"));
      if (!root) continue;
      const leaves = L.leaves(root);
      tabs.push({ id: newId("t"), root, active: ids.get(st.active) ?? leaves[0], zoomed: null, title: st.title, icon: st.icon, color: st.color });
    }
    if (tabs.length === 0) return false;
    this.set({ tabs, activeTab: tabs[Math.min(saved.activeTab, tabs.length - 1)].id });
    this.focusSoon();
    return true;
  }


  /** The title a tab shows. */
  tabTitle(tab: Tab): string {
    if (tab.title) return tab.title;
    const s = this.sessions.get(tab.active);
    if (!s) return "";
    if (s.title) return s.title;
    if (s.cwd) return baseName(s.cwd);
    return s.profile.name;
  }

  private updateWindowTitle(): void {
    const tab = this.tab;
    const title = tab ? `${this.tabTitle(tab)} — KS Forge` : "KS Forge";
    void getCurrentWindow().setTitle(title).catch(() => {});
  }

  focusSoon(): void {
    requestAnimationFrame(() => {
      if (this.state.overlay === "none" && !this.state.dialog && !this.state.renaming) this.session?.focus();
    });
  }

  // ----- Overlays, dialogs, menus -----

  openOverlay(overlay: Overlay, section?: string): void {
    this.set({ overlay, menu: null, settingsSection: section ?? this.state.settingsSection });
  }

  closeOverlay(): void {
    this.set({ overlay: "none" });
    this.focusSoon();
  }

  setSettingsSection(section: string): void {
    this.set({ settingsSection: section });
  }

  setSearching(on: boolean): void {
    if (!on) this.session?.clearSearch();
    this.set({ searching: on });
    if (!on) this.focusSoon();
  }

  confirm(d: Omit<Dialog, "resolve">): Promise<boolean> {
    return new Promise((resolve) => {
      this.set({
        dialog: {
          ...d,
          resolve: (ok) => {
            this.set({ dialog: null });
            this.focusSoon();
            resolve(ok);
          },
        },
      });
    });
  }

  private async confirmPaste(text: string): Promise<boolean> {
    if (!this.state.settings.confirmPaste) return true;
    const why = pasteWarning(text);
    if (!why) return true;
    const lines = text.replace(/[\r\n]+$/, "").split(/\r?\n|\r/);
    const preview = lines.slice(0, 12).join("\n") + (lines.length > 12 ? "\n…" : "");
    return this.confirm({
      title: why === "lines" ? t("paste.linesTitle", { count: lines.length }) : t("paste.sudoTitle"),
      body: t("paste.body"),
      detail: preview,
      ok: t("paste.ok"),
    });
  }

  showMenu(menu: Menu | null): void {
    this.set({ menu });
  }

  private paneMenu(id: string, x: number, y: number): void {
    this.focusPane(id);
    const s = this.sessions.get(id);
    if (!s) return;
    this.showMenu({
      x,
      y,
      items: [
        { label: t("common.copy"), run: () => void s.copySelection() },
        { label: t("common.paste"), run: () => void s.pasteFromClipboard() },
        "separator",
        { label: t("action.splitRight"), run: () => this.split("row") },
        { label: t("action.splitDown"), run: () => this.split("column") },
        "separator",
        { label: t("action.find"), run: () => this.setSearching(true) },
        { label: t("action.clear"), run: () => s.clear() },
        "separator",
        { label: t("action.closePane"), run: () => void this.closePane(id), danger: true },
      ],
    });
  }

  showToast(text: string): void {
    clearTimeout(this.toastTimer);
    this.set({ toast: text });
    this.toastTimer = window.setTimeout(() => this.set({ toast: null }), 4000);
  }

  // ----- Keyboard and actions -----

  private onKey(e: KeyboardEvent): void {
    if (e.isComposing) return;
    const combo = fromEvent(e);
    if (!combo) return;
    // Windows conventions: Ctrl+C copies when text is selected (otherwise it reaches the
    // shell as an interrupt), Ctrl+V pastes. Both are settings.
    const inTerminal = e.target instanceof HTMLElement && !!e.target.closest(".terminal-surface");
    if (this.state.platform === "windows" && inTerminal && this.state.overlay === "none") {
      const s = this.state.settings;
      if (combo === "ctrl+c" && s.ctrlCCopies && this.session?.term.hasSelection()) {
        e.preventDefault();
        e.stopPropagation();
        void this.session.copySelection().then(() => this.session?.term.clearSelection());
        return;
      }
      if (combo === "ctrl+v" && s.ctrlVPastes) {
        e.preventDefault();
        e.stopPropagation();
        void this.session?.pasteFromClipboard();
        return;
      }
    }
    const action = this.table.get(combo);
    const overlayOpen = this.state.overlay !== "none" || this.state.dialog !== null || this.state.renaming !== null;
    if (e.key === "Escape" && this.state.menu) {
      e.preventDefault();
      this.showMenu(null);
      return;
    }
    if (!action) return;
    // In a text field or an overlay, only the shortcuts that open or close things work.
    const el = e.target instanceof HTMLElement ? e.target : null;
    const typing = !!el && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el.isContentEditable) && !el.closest(".terminal-surface");
    const allowed: ActionId[] = ["palette", "openSettings", "quit"];
    if ((overlayOpen || typing) && !allowed.includes(action)) return;
    // Copy with nothing selected sends the key to the shell (Ctrl+C on Windows when rebound).
    if (action === "copy" && !this.session?.term.hasSelection()) return;
    e.preventDefault();
    e.stopPropagation();
    void this.run(action);
  }

  async run(action: ActionId | string): Promise<void> {
    const s = this.session;
    const tab = this.tab;
    this.showMenu(null);
    if (/^goToTab[1-9]$/.test(action)) {
      const n = Number(action.slice(7));
      const tabs = this.state.tabs;
      const target = n === 9 ? tabs[tabs.length - 1] : tabs[n - 1];
      if (target) this.selectTab(target.id);
      return;
    }
    switch (action) {
      case "newTab": return this.newTab();
      case "newWindow": return void api.newWindow(this.currentFolder()).catch((e) => this.showToast(errorText(e)));
      case "closePane": return tab ? this.closePane(tab.active) : undefined;
      case "closeTab": return this.closeTab();
      case "splitRight": return this.split("row");
      case "splitDown": return this.split("column");
      case "focusLeft": return this.moveFocus("left");
      case "focusRight": return this.moveFocus("right");
      case "focusUp": return this.moveFocus("up");
      case "focusDown": return this.moveFocus("down");
      case "resizeLeft": return this.resizePane("left");
      case "resizeRight": return this.resizePane("right");
      case "resizeUp": return this.resizePane("up");
      case "resizeDown": return this.resizePane("down");
      case "zoomPane": return this.toggleZoom();
      case "equalizePanes": return tab ? this.patchTab(tab.id, { root: L.equalize(tab.root) }) : undefined;
      case "nextTab":
      case "prevTab": {
        const tabs = this.state.tabs;
        const i = tabs.findIndex((x) => x.id === this.state.activeTab);
        const next = tabs[(i + (action === "nextTab" ? 1 : -1) + tabs.length) % tabs.length];
        if (next) this.selectTab(next.id);
        return;
      }
      case "moveTabLeft":
      case "moveTabRight": {
        const i = this.state.tabs.findIndex((x) => x.id === this.state.activeTab);
        return this.moveTab(i, i + (action === "moveTabLeft" ? -1 : 1));
      }
      case "renameTab": return tab ? this.set({ renaming: tab.id }) : undefined;
      case "duplicateTab": return this.duplicateTab();
      case "palette": return this.state.overlay === "palette" ? this.closeOverlay() : this.openOverlay("palette");
      case "find": return this.setSearching(true);
      case "copy": return s?.copySelection();
      case "paste": return s?.pasteFromClipboard();
      case "selectAll": return s?.term.selectAll();
      case "clear": return s?.clear();
      case "scrollToTop": return s?.term.scrollToTop();
      case "scrollToBottom": return s?.term.scrollToBottom();
      case "prevPrompt": return s?.jumpPrompt(-1);
      case "nextPrompt": return s?.jumpPrompt(1);
      case "fontBigger":
      case "fontSmaller":
      case "fontReset": {
        const delta = action === "fontReset" ? 0 : this.state.fontDelta + (action === "fontBigger" ? 1 : -1);
        this.set({ fontDelta: delta });
        const size = this.effective().fontSize;
        for (const x of this.sessions.values()) x.setFontSize(size);
        return;
      }
      case "openSettings": return this.state.overlay === "settings" ? this.closeOverlay() : this.openOverlay("settings");
      case "openSettingsFile": return api.openSettingsFile().catch((e) => this.showToast(errorText(e)));
      case "nextTheme": {
        const all = this.allThemes();
        const i = all.findIndex((x) => x.id === this.theme.id);
        const next = all[(i + 1) % all.length];
        this.updateSettings({ followSystem: false, theme: next.id });
        this.showToast(t("toast.theme", { name: next.name }));
        return;
      }
      case "checkUpdates":
        this.openOverlay("settings", "updates");
        return this.updates.checkNow();
      case "quit": return this.quit();
    }
  }

  /** Text for a key from the language files, typed loosely for keys built at run time. */
  text(key: TextKey, params?: Record<string, string | number>): string {
    return t(key, params);
  }
}

/** A dropped file's path, quoted for the shell. */
export function quotePath(path: string, platform: Platform): string {
  if (platform === "windows") return /[\s&()^%!;,]/.test(path) ? `"${path}"` : path;
  return /^[A-Za-z0-9_./~+-]+$/.test(path) ? path : `'${path.replace(/'/g, "'\\''")}'`;
}

export const app = new App();
