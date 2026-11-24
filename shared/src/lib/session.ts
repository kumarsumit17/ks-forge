// One terminal pane: an xterm.js terminal drawn on the GPU (WebGL), connected to a shell on a
// PTY in Rust. A session lives outside React: its element is moved between panes when the
// layout changes, so splitting or zooming never restarts the shell or loses scrollback.

import { Terminal, type ITheme, type IDecoration, type IMarker } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { WebglAddon } from "@xterm/addon-webgl";
import { api } from "./tauri.ts";
import { fontStack, type Profile, type Settings } from "./settings.ts";
import type { Theme } from "./themes.ts";
import { folderFromOsc7, ligatureRanges } from "./text.ts";
import type { Platform } from "./keys.ts";

export interface SessionEvents {
  /** The title, folder or running state changed. */
  changed(): void;
  /** The shell ended. `code` 0 closes the pane. */
  exited(code: number): void;
  /** A link was clicked with the modifier held. */
  openLink(url: string): void;
  /** Text is about to be pasted; resolve false to cancel. */
  confirmPaste(text: string): Promise<boolean>;
  /** The pane got the keyboard focus (a click). */
  focused(): void;
  /** Right-click: the pane's menu at this place. */
  contextMenu(x: number, y: number): void;
  /** The text of a failed write (shown once). */
  error(e: unknown): void;
}

export interface SearchOptions {
  caseSensitive: boolean;
  wholeWord: boolean;
  regex: boolean;
}

const MAX_MARKS = 2000;

export class Session {
  readonly id: string;
  readonly element: HTMLDivElement;
  readonly term: Terminal;
  profile: Profile;
  cwd: string;
  title = "";
  ptyId: number | null = null;
  exited = false;
  private pendingInput = "";
  private fit = new FitAddon();
  private search = new SearchAddon();
  private webgl: WebglAddon | null = null;
  private opened = false;
  private host: HTMLElement | null = null;
  private resizeObserver: ResizeObserver;
  private fitFrame = 0;
  private prompts: IMarker[] = [];
  private failures: IDecoration[] = [];
  private joiner: number | null = null;
  private lastSize = { cols: 0, rows: 0 };
  private settings: Settings;
  private platform: Platform;
  private events: SessionEvents;
  private searchResults = { index: -1, count: 0 };
  private onSearchResults: ((index: number, count: number) => void) | null = null;

  constructor(id: string, profile: Profile, cwd: string, settings: Settings, theme: Theme, platform: Platform, events: SessionEvents) {
    this.id = id;
    this.profile = profile;
    this.cwd = cwd;
    this.settings = settings;
    this.platform = platform;
    this.events = events;
    this.element = document.createElement("div");
    this.element.className = "terminal-surface";
    this.term = new Terminal({
      allowProposedApi: true,
      allowTransparency: false,
      fontFamily: fontStack(settings.fontFamily, platform),
      fontSize: settings.fontSize,
      lineHeight: settings.lineHeight,
      fontWeight: settings.fontWeight as never,
      fontWeightBold: "bold",
      cursorStyle: settings.cursorStyle,
      cursorBlink: settings.cursorBlink,
      scrollback: settings.scrollback,
      macOptionIsMeta: settings.optionIsMeta,
      macOptionClickForcesSelection: true,
      rightClickSelectsWord: false,
      drawBoldTextInBrightColors: true,
      theme: xtermTheme(theme),
      linkHandler: { activate: (e, uri) => this.link(e, uri), allowNonHttpProtocols: false },
    });
    this.term.loadAddon(this.fit);
    this.term.loadAddon(this.search);
    this.term.loadAddon(new Unicode11Addon());
    this.term.unicode.activeVersion = "11";
    this.term.loadAddon(new WebLinksAddon((e, uri) => this.link(e, uri)));
    this.search.onDidChangeResults((r) => {
      this.searchResults = { index: r.resultIndex, count: r.resultCount };
      this.onSearchResults?.(r.resultIndex, r.resultCount);
    });

    this.term.onData((d) => {
      if (this.exited) {
        if (d === "\r") void this.restart();
        return;
      }
      // Before the shell's id is known (ConPTY asks for the cursor position at once, and
      // xterm.js answers it), input is kept and sent as soon as the shell has started.
      if (this.ptyId === null) this.pendingInput += d;
      else api.write(this.ptyId, d).catch((e) => this.events.error(e));
    });
    this.term.onTitleChange((t) => {
      this.title = t;
      this.events.changed();
    });
    this.term.onSelectionChange(() => {
      if (this.settings.copyOnSelect && this.term.hasSelection()) void api.clipboardWrite(this.term.getSelection());
    });
    this.term.parser.registerOscHandler(7, (data) => {
      const folder = folderFromOsc7(data);
      if (folder) {
        this.cwd = folder;
        this.events.changed();
      }
      return true;
    });
    this.term.parser.registerOscHandler(133, (data) => this.mark(data));

    // Paste goes through one place, so the multi-line warning covers the menu, the keys and
    // the right-click menu alike.
    this.element.addEventListener(
      "paste",
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        void this.paste(e.clipboardData?.getData("text/plain") ?? "");
      },
      true,
    );
    this.element.addEventListener("mousedown", () => this.events.focused());
    this.element.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      if (this.settings.rightClickPaste) {
        if (this.term.hasSelection()) {
          void api.clipboardWrite(this.term.getSelection());
          this.term.clearSelection();
        } else {
          void this.pasteFromClipboard();
        }
        return;
      }
      this.events.contextMenu(e.clientX, e.clientY);
    });
    this.resizeObserver = new ResizeObserver(() => this.scheduleFit());
  }

  /** Puts the terminal into `host` (a pane), opening it and starting the shell the first time. */
  attach(host: HTMLElement): void {
    if (this.host === host && this.element.parentElement === host) return;
    if (this.host) this.resizeObserver.unobserve(this.host);
    this.host = host;
    host.appendChild(this.element);
    this.resizeObserver.observe(host);
    if (!this.opened) {
      this.opened = true;
      this.term.open(this.element);
      this.loadWebgl();
      this.applyLigatures();
      this.fitNow();
      void this.start();
    } else {
      this.scheduleFit();
    }
  }

  detach(host: HTMLElement): void {
    if (this.host !== host) return;
    this.resizeObserver.unobserve(host);
    this.host = null;
  }

  private loadWebgl(): void {
    try {
      const gl = new WebglAddon();
      gl.onContextLoss(() => {
        // The GPU was reset: drop to the DOM renderer rather than show nothing.
        gl.dispose();
        this.webgl = null;
      });
      this.term.loadAddon(gl);
      this.webgl = gl;
    } catch {
      this.webgl = null;
    }
  }

  get renderer(): "webgl" | "dom" {
    return this.webgl ? "webgl" : "dom";
  }

  private async start(): Promise<void> {
    this.exited = false;
    this.pendingInput = "";
    this.prompts = [];
    try {
      this.ptyId = await api.spawn(
        {
          program: this.profile.program,
          args: this.profile.args,
          cwd: this.cwd || this.profile.cwd,
          env: this.profile.env,
          shellIntegration: this.profile.shellIntegration,
          cols: this.term.cols,
          rows: this.term.rows,
        },
        (bytes) => this.term.write(bytes),
      );
      this.lastSize = { cols: this.term.cols, rows: this.term.rows };
      if (this.pendingInput) {
        const input = this.pendingInput;
        this.pendingInput = "";
        await api.write(this.ptyId, input).catch((e) => this.events.error(e));
      }
      this.events.changed();
    } catch (e) {
      this.exited = true;
      this.events.error(e);
    }
  }

  async restart(): Promise<void> {
    this.term.write("\x1b[0m\r\n");
    await this.start();
  }

  /** Called by the app when Rust reports the shell ended. */
  handleExit(code: number): void {
    this.ptyId = null;
    this.exited = true;
    this.events.exited(code);
  }

  /** Shown in the pane when the shell ended with an error, so its output stays readable. */
  writeNote(text: string): void {
    this.term.write(`\r\n\x1b[2m${text}\x1b[0m\r\n`);
  }

  private scheduleFit(): void {
    if (this.fitFrame) return;
    this.fitFrame = requestAnimationFrame(() => {
      this.fitFrame = 0;
      this.fitNow();
    });
  }

  private fitNow(): void {
    if (!this.host || this.host.clientWidth === 0 || this.host.clientHeight === 0) return;
    try {
      this.fit.fit();
    } catch {
      return;
    }
    const { cols, rows } = this.term;
    if (this.ptyId !== null && (cols !== this.lastSize.cols || rows !== this.lastSize.rows)) {
      this.lastSize = { cols, rows };
      void api.resize(this.ptyId, cols, rows).catch(() => {});
    }
  }

  focus(): void {
    this.term.focus();
  }

  /** Applies changed settings or theme without restarting the shell. */
  update(settings: Settings, theme: Theme, profile: Profile): void {
    const fontChanged = settings.fontFamily !== this.settings.fontFamily || settings.fontSize !== this.term.options.fontSize;
    this.settings = settings;
    this.profile = profile;
    const o = this.term.options;
    o.fontFamily = fontStack(settings.fontFamily, this.platform);
    o.fontSize = settings.fontSize;
    o.lineHeight = settings.lineHeight;
    o.fontWeight = settings.fontWeight as never;
    o.cursorStyle = settings.cursorStyle;
    o.cursorBlink = settings.cursorBlink;
    o.scrollback = settings.scrollback;
    o.macOptionIsMeta = settings.optionIsMeta;
    o.theme = xtermTheme(theme);
    this.applyLigatures();
    if (fontChanged && this.webgl) {
      // The WebGL glyph atlas holds the old font's glyphs.
      this.webgl.clearTextureAtlas();
    }
    this.scheduleFit();
  }

  setFontSize(size: number): void {
    this.term.options.fontSize = size;
    this.webgl?.clearTextureAtlas();
    this.scheduleFit();
  }

  private applyLigatures(): void {
    if (!this.opened) return;
    if (this.settings.ligatures && this.joiner === null) {
      this.joiner = this.term.registerCharacterJoiner((text) => ligatureRanges(text));
    } else if (!this.settings.ligatures && this.joiner !== null) {
      this.term.deregisterCharacterJoiner(this.joiner);
      this.joiner = null;
    }
  }

  private link(e: MouseEvent, uri: string): void {
    const withModifier = this.platform === "macos" ? e.metaKey : e.ctrlKey;
    if (withModifier) this.events.openLink(uri);
  }

  /** OSC 133: A = a prompt starts, C = a command starts, D;<code> = it ended. */
  private mark(data: string): boolean {
    const [kind, arg] = data.split(";");
    if (kind === "A") {
      const m = this.term.registerMarker(0);
      if (m) {
        this.prompts.push(m);
        m.onDispose(() => {
          this.prompts = this.prompts.filter((x) => x !== m);
        });
        if (this.prompts.length > MAX_MARKS) this.prompts.shift()?.dispose();
      }
    } else if (kind === "D" && arg && arg !== "0") {
      // The command's prompt line gets a red mark at the left edge and in the scroll bar.
      const prompt = this.prompts[this.prompts.length - 1];
      if (prompt && !prompt.isDisposed) {
        const d = this.term.registerDecoration({
          marker: prompt,
          x: 0,
          width: 1,
          layer: "top",
          overviewRulerOptions: { color: "#f0607a", position: "left" },
        });
        if (d) {
          d.onRender((el) => el.classList.add("failed-mark"));
          this.failures.push(d);
          if (this.failures.length > MAX_MARKS) this.failures.shift()?.dispose();
        }
      }
    }
    return true;
  }

  /** Scrolls to the previous (-1) or next (+1) prompt. */
  jumpPrompt(dir: -1 | 1): void {
    const top = this.term.buffer.active.viewportY;
    const lines = this.prompts.filter((m) => !m.isDisposed).map((m) => m.line);
    const target = dir < 0 ? [...lines].reverse().find((l) => l < top) : lines.find((l) => l > top);
    if (target !== undefined) this.term.scrollToLine(target);
    else if (dir > 0) this.term.scrollToBottom();
  }

  async paste(text: string): Promise<void> {
    if (!text || this.exited) return;
    if (!(await this.events.confirmPaste(text))) return;
    this.term.paste(text);
    this.term.focus();
  }

  async pasteFromClipboard(): Promise<void> {
    try {
      await this.paste(await api.clipboardRead());
    } catch (e) {
      this.events.error(e);
    }
  }

  async copySelection(): Promise<void> {
    if (this.term.hasSelection()) await api.clipboardWrite(this.term.getSelection());
  }

  clear(): void {
    this.term.clear();
  }

  find(query: string, opts: SearchOptions, backwards = false): void {
    const decorations = {
      matchBackground: "#7a5a1e",
      activeMatchBackground: "#ff8a3d",
      matchOverviewRuler: "#c9a24a",
      activeMatchColorOverviewRuler: "#ff8a3d",
    };
    const o = { ...opts, decorations, incremental: false };
    if (!query) {
      this.search.clearDecorations();
      this.onSearchResults?.(-1, 0);
      return;
    }
    if (backwards) this.search.findPrevious(query, o);
    else this.search.findNext(query, o);
  }

  watchSearch(f: ((index: number, count: number) => void) | null): void {
    this.onSearchResults = f;
    if (f) f(this.searchResults.index, this.searchResults.count);
  }

  clearSearch(): void {
    this.search.clearDecorations();
    this.term.clearSelection();
  }

  /** Whether a program other than the shell is running in front (macOS only). */
  kill(): void {
    if (this.ptyId !== null) void api.kill(this.ptyId);
  }

  dispose(): void {
    this.kill();
    this.resizeObserver.disconnect();
    if (this.fitFrame) cancelAnimationFrame(this.fitFrame);
    this.term.dispose();
    this.element.remove();
  }
}

export function xtermTheme(t: Theme): ITheme {
  return {
    background: t.background,
    foreground: t.foreground,
    cursor: t.cursor,
    cursorAccent: t.background,
    selectionBackground: t.selection,
    black: t.black,
    red: t.red,
    green: t.green,
    yellow: t.yellow,
    blue: t.blue,
    magenta: t.magenta,
    cyan: t.cyan,
    white: t.white,
    brightBlack: t.brightBlack,
    brightRed: t.brightRed,
    brightGreen: t.brightGreen,
    brightYellow: t.brightYellow,
    brightBlue: t.brightBlue,
    brightMagenta: t.brightMagenta,
    brightCyan: t.brightCyan,
    brightWhite: t.brightWhite,
    scrollbarSliderBackground: t.foreground + "22",
    scrollbarSliderHoverBackground: t.foreground + "44",
    scrollbarSliderActiveBackground: t.foreground + "66",
  };
}
