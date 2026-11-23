---
type: Plan
title: First version plan
description: The plan for the suite's modern terminal for macOS and Windows: name, stack with reasons, the first version's features, what waits for later, languages, updates, packaging and the release steps.
tags: [plan, terminal, stack, tauri, rust, pty, conpty, xterm, release]
status: approved by the owner on 2026-11-24 (name KS Forge, Rust/Tauri stack); v0.1.0 built
---

# First version plan

A fast, private terminal for macOS and Windows, easy for someone opening a terminal for the first time and deep enough for daily power use: tabs, split panes, profiles, themes, fonts, shortcuts, a command palette and shell integration, all set from a settings screen or a settings file. Free, no ads, no analytics, no account, no network except the daily update check.

The reference terminals (Wave Terminal, Warp, the "terminal stack" article) are used for the list of features and the feel only. No code, icons, themes, layouts or other assets come from them; everything here is written and drawn for this app.

## 1. Name

**KS Forge**, chosen by the owner on 2026-11-24: repository `ks-forge`, bundle identifier and package root `com.ks.forge`. A forge is where tools are made and shaped: a power tool you shape to your own hands.

## 2. Stack (owner's decision: needs an exception to the Kotlin rule)

**Recommendation: Rust + Tauri 2 + TypeScript, the same stack as `ks-download-manager`.** The suite rule is Kotlin for apps, with `ks-download-manager` as the one exception, so this needs a second exception: **the owner approved it on 2026-11-24**. On approval, the workspace `CLAUDE.md` and `specs/conventions.md` name this app next to `ks-download-manager`.

| Part | Choice | Licence |
|---|---|---|
| Shell and windows | Tauri 2 (system web view: WKWebView on macOS, WebView2 on Windows) | MIT / Apache-2.0 |
| Processes | Rust; `portable-pty` for a PTY on macOS and ConPTY on Windows (Windows 10 1809 or later) | MIT |
| Terminal grid | `xterm.js` with its WebGL renderer (the grid is drawn on the GPU), plus its fit, search, web-links, unicode11, clipboard and ligatures add-ons | MIT |
| Interface | React, Tailwind CSS, shadcn/ui, Lucide icons, as in `ks-download-manager` | MIT / ISC |
| Shared code | `ks-utility` Rust crate and TypeScript package, pinned by tag: translator, language check, app-update helpers, SHA-256 | own |

Why:
- **Speed where it counts.** The grid is GPU-drawn (WebGL), parsing is xterm.js's tuned parser, and the PTY reads happen in Rust and reach the view in batched binary messages, not one message per byte. Tauri starts in a fraction of a second and the app is about 10 MB, not the 150 MB of an Electron app.
- **One codebase for both systems.** `portable-pty` hides the PTY / ConPTY difference behind one API; xterm.js and the interface are the same on both.
- **The suite already runs this stack.** Toolchain, CI patterns, Tauri packaging (dmg, NSIS), the Rust and TypeScript halves of `ks-utility` (app updates, languages) and the clean-room and dependency rules are all in place from `ks-download-manager`.
- **A settings screen, palette and dialogs are cheap** in React with the suite's components, where a native GPU toolkit would need every control built by hand.

Considered and not chosen:
- **Kotlin + Compose Desktop + JediTerm + pty4j** keeps the Kotlin rule, but the JVM takes about a second to start and 200 MB or more of memory, JediTerm draws with Swing on the CPU, and pty4j ships native helpers per system. It would not feel snappy.
- **Pure Rust with a native GPU renderer** (wgpu and a terminal-state crate) is the fastest possible, but every tab bar, menu, settings page and palette would be hand-built. A possible later step for the grid only, if measurements ever show the WebGL grid is the bottleneck.

Speed is measured, not claimed: start-up to first prompt, typing latency and output throughput (`cat` of a 100 MB file, `yes` for 10 s) are recorded in `docs/benchmarks.md` against the system terminal on the same machine. No speed claim is made that was not measured.

## 3. First version (v1.0.0) features

**Must work for the first release** (the milestone): tabs, split panes, themes and settings, on macOS and Windows. The rest of this list is the first version's scope and lands across the first minor versions if needed.

- **Tabs:** new, close, reorder by drag, rename, duplicate; an optional icon and colour per tab; tab bar can sit at the top or be hidden in single-tab use; closing a tab with a running program asks first.
- **Split panes:** split right or down, any depth; resize by dragging or shortcuts; move focus with shortcuts or the mouse; zoom a pane to fill the tab and back; close a pane; equalise sizes.
- **Profiles:** shell, arguments, starting folder, environment variables, theme, font and icon per profile. Found automatically: zsh, bash, fish on macOS; PowerShell 7, Windows PowerShell, Command Prompt, Git Bash and WSL distributions on Windows. A default profile and a "new tab with…" menu.
- **Themes and colour schemes:** our own set of eight or more schemes (light and dark), the interface following the system light/dark or set by hand, an accent colour, background opacity and blur where the system supports it, cursor style and blink. Schemes import and export as a small JSON file of our own format.
- **Fonts and ligatures:** any installed monospace font (list from the system), size, line height, weight, ligatures on or off. Default: SF Mono / Menlo on macOS, Cascadia Mono on Windows (shipped with Windows 11; Consolas otherwise). No font is bundled in v1.
- **Icons:** Lucide for the interface; a chosen set of Lucide icons for tabs and profiles; the app icon is our own.
- **Keyboard shortcuts:** defaults that feel native on each system (Cmd on macOS, Ctrl+Shift on Windows), every action rebindable in settings and the settings file, conflicts shown.
- **Command palette:** Cmd+Shift+P / Ctrl+Shift+P; every action, profile and theme, with fuzzy search and the shortcut shown beside each.
- **Search in scrollback:** find bar with next/previous, match case, whole word, regular expression, match count; scrollback length set in settings.
- **Links:** URLs found in output, opened with Cmd-click / Ctrl-click in the default browser; OSC 8 hyperlinks. File paths later.
- **Clipboard:** copy and paste, copy on select (optional), bracketed paste, a warning before pasting several lines or a command with `sudo`, right-click copy/paste on Windows (optional), OSC 52 copy from programs (off by default).
- **Shell integration** for zsh, bash, fish and PowerShell, written for this app: the shell reports its folder (OSC 7) and marks each prompt and command with its exit status (OSC 133). This gives new tabs and splits in the same folder, jumping between prompts, a mark beside failed commands, and selecting one command's output. It loads without editing the user's own shell files and can be turned off per profile.
- **Settings:** a settings screen (General, Appearance, Profiles, Keyboard, App updates, About) and the same settings in one `settings.json` in the app's data folder, which the app reloads live when it changes; a bad file never stops the app (it says what is wrong and keeps the last good settings). "Open settings file" from the palette.
- **Window and session:** restore the last window's tabs and layout on start (optional), remember window size and position, quit asks when programs are running.
- **Accessibility:** screen-reader mode of xterm.js, keyboard use of every control, zoom with Cmd/Ctrl + and −.

## 4. Later (not in the first version)

- **AI features** (command suggestions, explain an error): only opt-in, off by default, with the user's own key or a local model, and never sending terminal content without the user asking each time. Needs its own privacy spec first.
- **Remote sessions:** a saved SSH connections list, remote file browsing, reconnecting sessions.
- **Plugins or extensions**, and Wave-style side widgets (file preview, web page, notes).
- Warp-style input editor and command blocks beyond what shell integration gives.
- Quake-style drop-down window, file-path links, image protocols (Sixel / iTerm2 / Kitty), bundled fonts, Linux, Intel macOS, Windows on ARM.
- Developer ID signing and notarisation for macOS, Authenticode for Windows (see Packaging).

## 5. Languages

The interface is in English and Hindi through `ks-utility` (its `specs/languages.md`): every string a key in `shared/src/locales/{en,hi}.json` or the shared `common.*` catalogue, used through the ks-utility translator; the suite's language rule (follow the system, allow a choice in settings, remember it); Hindi following ks-utility's Hindi style guide; `test:lang` runs ks-utility's language-file check. Rust sends message codes, never sentences. What runs inside the terminal is never translated. Known limit: xterm.js shows Devanagari conjuncts in fixed cells, so Hindi typed at the prompt may look spaced; noted in the help, fixed upstream if ever.

## 6. App updates

Through `ks-utility`'s shared app-update helpers (Rust `ks_utility::app_update`, as `ks-download-manager` does): the "App updates" section in settings with the shared `common.appUpdate.*` texts, the daily automatic check (on by default, a switch turns it off, the shared privacy note beside it), SHA-256 check of the download, then the dmg is opened (macOS) or the installer started and the app quit (Windows). This check is the app's one network request.

## 7. Layout

The suite's platform folders all exist: `tv/google-tv/`, `mobile/android/`, `mobile/ios/` hold only a `.gitkeep`. One Tauri codebase builds both desktop targets, so it lives in `shared/` (`shared/src/` interface, `shared/src-tauri/` Rust). `desktop/mac/` and `desktop/windows/` hold only what is specific to one system: Tauri config overrides (bundle settings, entitlements, NSIS settings), installer files and any system-only code. `ks-utility` is a git dependency pinned by tag in `package.json` and `Cargo.toml`, as in `ks-download-manager`.

## 8. Packaging and release

- Files, named as the suite's app-update and landing-page rules expect: `<app>-v<version>-macos-arm64.dmg` and `<app>-v<version>-windows-x64-setup.exe` (Tauri NSIS installer; per-user install, no admin rights).
- Versions come from the tag (`tauri build --config '{"version":"X.Y.Z"}'`); `Cargo.toml` keeps the `0.0.0` placeholder the Tauri CLI needs.
- **Release workflow:** `ks-utility`'s shared release workflow is for the Kotlin apps only (Gradle modules), and `ks-download-manager` keeps its own. Recommendation: this app's `release.yml` follows the release cycle and `ks-download-manager`'s shape for the first release (tag on `main`, rehearsal by manual run, read-only build jobs on `macos-15` and `windows-2025`, one publish job, attestations, pinned actions). Then, as a separate ks-utility change, the shared steps move into a `tauri-app-release.yml` there that both Tauri apps call.
- **Signing, said plainly:** the suite key (`ks-release`) is an Android key and cannot sign a dmg or a Windows installer. Like every suite desktop build today, the first release is **not** Developer-ID-signed or notarised (first open on macOS: System Settings › Privacy & Security › Open Anyway) and **not** Authenticode-signed (SmartScreen: More info › Run anyway). Real signing needs an Apple Developer ID and a Windows code-signing certificate, which only the owner can buy. The suite rule "a new repository: signing first" still applies: the owner sets the four secrets when the repository is created.
- CI on every push to `dev`: Rust tests and clippy, TypeScript build and tests, language check, on macOS and Windows, with the unsigned Windows installer kept as an artifact for testing.

## 9. Steps

1. **Owner:** pick the name *(done: KS Forge)* and approve this plan and the stack exception *(done, 2026-11-24)*.
2. Rename the folder *(done)*, create the GitHub repository *(done)*, the owner sets the four signing secrets *(waiting)*; add the app to the workspace `.gitignore`, `CLAUDE.md`, `specs/platform-folders.md`, `specs/testing.md` and `specs/conventions.md`.
3. Scaffold on `dev`: platform folders, Tauri app in `shared/`, ks-utility pinned, CLAUDE.md, graphify setup, CI. *(done)*
4. PTY core (Rust) with tests; one terminal in one window, on macOS. *(done)*
5. Tabs, splits, profiles, themes, settings screen and file, palette, search, links, clipboard, shell integration, English and Hindi, App updates. *(done)*
6. Measure speed (`docs/benchmarks.md`); Windows checks on CI; rehearsal of the release. *(macOS measured)*
7. `v0.1.0` released for the owner to test on macOS and Windows; feedback goes into the next versions, then `v1.0.0`.

## Decisions while building v0.1.0

- **Ligatures** come from our own character joiner for common programming sequences (`shared/src/lib/text.ts`), drawn by the WebGL renderer with the font's ligature. xterm.js's ligatures addon needs Node to read font files, so it cannot run in a web view.
- **No background opacity or blur yet**: a transparent window needs Tauri's macOS private API, which the App Store and future signing may refuse. Later.
- **Session restore** (reopening the last tabs) is left for a later version.
- **Running-program check on close** works on macOS (the terminal's foreground process group); ConPTY does not report it, so Windows asks only when it can tell (it cannot yet).
- **Self-test** (`KS_FORGE_SELFTEST=1`) drives the real window on CI for both systems, since Windows is tested on CI only.
- The macOS menu has no Cmd+W "Close Window" (Cmd+W closes a pane) and Quit asks before closing running programs.
