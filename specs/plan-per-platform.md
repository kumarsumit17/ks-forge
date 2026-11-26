---
type: Plan
title: Per-platform optimization plan
description: Approved plan for making each KS Forge build (macOS, Windows) its own app with its own version, tuned to its OS for look, input, performance, packaging, OS integrations and accessibility.
tags: [plan, platforms, macos, windows, accessibility, performance]
---

# Per-platform optimization plan

**Status: approved by the owner on 2026-11-25.** Decisions: 1 one tag per platform, `mac-vX.Y.Z` and `windows-vX.Y.Z` (the suite rule, owner, 2026-11-25; it replaced the one-version rule the owner first chose here); 2 (a) tabs in the Windows title bar; 3 all three dependencies (single instance, notifications, jump list); 4 yes, background blur on macOS (a setting, off by default). Not asked, so the defaults hold: 5 Apple silicon and x64 only; 6 unsigned until the owner has certificates; 7 the owner's Windows hand check after step 4. Built steps are marked in section 4. The suite rule: every platform build is its own app with its own version, the best it can be on its OS ([Platform folders](https://github.com/kumasumit/ks-suite/blob/main/specs/platform-folders.md)). Modelled on ks-jaiplayer's plan.

KS Forge targets macOS and Windows only (`tv/google-tv`, `mobile/*` stay empty). The terminal core stays written once in `shared/`: the Rust PTY layer, settings, shell integration and the React and xterm.js interface. What differs per OS moves to its platform folder: Tauri config overrides (already there) and, new, platform-only Rust in `desktop/mac/src/` and `desktop/windows/src/`, compiled into the one crate with `#[cfg(target_os)]` and `#[path]`, so `shared/` keeps no code for one platform only.

## 1. Audit: what each build does today (v0.1.0, 2026-11-25)

| | macOS (`desktop/mac`) | Windows (`desktop/windows`) |
|---|---|---|
| Window and look | Overlay title bar: the traffic lights sit in our tab bar (`titleBarStyle: Overlay`); window colours follow the terminal theme; no background blur | Native **light** title bar above our tab bar even with a dark theme, so two bars use about 70 px; no Mica; colours follow the theme below the title bar |
| Menus | Own menu bar: app (About, Settings ⌘,, Hide, Quit ⌘Q asks about running programs), Edit (Copy, Paste), Window. No File or Shell menu, no Dock menu | None (no menu bar, as Windows terminals usually have), only our tab bar and right-click menu |
| Shortcuts | ⌘ shortcuts (⌘T, ⌘D, ⌘W, ⌘K, ⌘F, ⌘⇧P); Option as Meta is a setting | Ctrl+Shift shortcuts (Ctrl+Shift+T/D/E/W/F/P); **Ctrl+C / Ctrl+V do not copy or paste** (Windows Terminal does this when text is selected) |
| Shells | Login shell found from `$SHELL`, zsh/bash/fish, `-l`; `LANG` set when missing | pwsh, Windows PowerShell, cmd, Git Bash, WSL distributions; no "run as administrator" profile |
| PTY | `openpty`; running-program check before close works | ConPTY; **running-program check does not work** (always "not busy"); exit reported after a 1 s grace; start-up cursor query handled |
| Shell integration | zsh, bash, fish: folder, prompt marks, exit status | PowerShell: folder, prompt, exit status (no command-start mark); none for cmd, WSL shells only through their own bash/zsh rc |
| OS integration | None: no "New KS Forge Tab Here" Finder service, no folder dropped on the Dock icon, no dragging files into the terminal, one window only, no Secure Keyboard Entry | None: no Explorer "Open in KS Forge", no jump list, no command-line options (`-d <folder>`, `-p <profile>`), a second launch starts a second app, one window only |
| Notifications | None (e.g. a long command finished while the window is in the back) | None |
| Fonts | `ui-monospace` (SF Mono), Menlo; ligatures through our joiner | Cascadia Mono, Consolas |
| Rendering | WebKit (WKWebView) + xterm.js WebGL | WebView2 (Chromium) + xterm.js WebGL; not measured on a real PC |
| Start-up and speed | Measured: ~430 ms warm to first prompt, 1 M lines in ~3.2 s, app 8.5 MB, dmg 4.5 MB | Measured on CI only (9 s, shared VM, first start); installer 3.4 MB; WebView2 downloaded by the installer when missing |
| Packaging | dmg, Apple silicon only, ad hoc signature, not notarised | NSIS per-user installer, x64 only, not Authenticode-signed; no ARM64 build |
| Updates | ks-utility checker: opens the dmg | ks-utility checker: runs the installer and quits |
| Version | One tag `vX.Y.Z` for both | Same |
| Accessibility | Icon buttons labelled; xterm's screen reader mode **not on**; VoiceOver not tested; no "reduce motion" | Same labels; screen reader mode not on; Narrator and NVDA not tested; Windows high-contrast colours not followed |

Other findings: the tab bar is the window's drag area on both, but double-clicking it does not zoom or maximize on Windows (no native caption there). On Windows, a long PowerShell first start (9 s on CI) shows an empty pane, with no "starting…" hint.

## 2. The plan, per platform

"New dependency" items are reported as [Dependencies](dependencies.md) requires and wait for decision 3.

### 2.1 macOS (`desktop/mac/`)

- **Look**: optional background blur behind the terminal (`NSVisualEffectView` through Tauri's `macOSPrivateApi` and a translucent theme background; decision 4). Proper title-bar double-click (zoom, as the system setting says).
- **Menus like a Mac app**: Shell menu (New Tab, New Window ⌘N, Split, Close), View (font size, zoom pane, full screen), Window list of open windows, a Dock menu (New Tab, New Window, each profile).
- **Multiple windows** (⌘N), each with its own tabs; the shared app state becomes one per window.
- **Finder**: "New KS Forge Tab Here" and "New KS Forge Window Here" Services for folders; a folder dropped on the Dock icon opens a tab there; files dragged into a pane type their quoted paths.
- **Secure Keyboard Entry** (Shell menu), so other apps cannot read typed passwords (`EnableSecureEventInput`, Carbon, no new dependency).
- **Option key**: Left and right Option set separately as Meta (common for people who type accented characters with one of them).
- **Notifications**: "Command finished" when a command that ran more than 10 s ends while the window is in the back, from the shell integration's marks (decision 3: `tauri-plugin-notification`).
- **Performance**: measure cold start from Finder; keep the Apple-silicon-only build small; the WebGL glyph atlas is rebuilt only when the font changes.
- **Packaging**: notarised dmg once the owner has a Developer ID (decision 6); Intel build only if asked (decision 5).
- **Accessibility**: screen reader mode on when VoiceOver is running (or by setting), labelled controls, "Reduce motion" honoured, VoiceOver pass.

### 2.2 Windows (`desktop/windows/`)

- **Look**: the tabs move into the title bar with our own minimise, maximise and close buttons and Snap Layouts on hover (Windows 11), like other modern Windows terminals; Mica or Acrylic behind it (Tauri `windowEffects`); dark or light caption following the theme (decision 2).
- **Input**: Ctrl+C copies when text is selected and sends Ctrl+C otherwise; Ctrl+V pastes (both settings, on by default as Windows users expect); Alt+Enter and F11 full screen; Ctrl+Shift+number opens a profile.
- **Running-program check**: list the shell's child processes (`CreateToolhelp32Snapshot`, `windows-sys` is already in the dependency tree) so closing a tab with a running program asks first, as on macOS.
- **Explorer and the shell**: "Open in KS Forge" on folders and folder backgrounds (per-user registry keys written and removed by the installer); command-line options `ks-forge.exe [-d <folder>] [-p <profile>]`; a second launch opens a tab in the running app instead of a second app (decision 3: `tauri-plugin-single-instance`); a taskbar jump list with the profiles (decision 3: `windows` crate COM, or left out).
- **Profiles**: "Run as administrator" per profile (starts an elevated copy through `ShellExecute runas`, since one window cannot mix elevation); WSL default folder `~`; Visual Studio developer shells found when installed.
- **Start-up**: a "Starting PowerShell…" hint in a pane until the first output; measure start-up and output speed on a real PC (owner, decision 7); pre-warm WebView2 is not needed if the numbers are good.
- **Packaging**: x64 installer as now; ARM64 installer if wanted (decision 5); Authenticode signing once the owner has a certificate (decision 6); later a winget manifest.
- **Accessibility**: screen reader mode when Narrator or NVDA runs (`SPI_GETSCREENREADER`), high-contrast mode follows the system colours (`forced-colors`), Narrator pass by the owner.

### 2.3 Shared (`shared/`)

- Per-window state (both platforms need it for multiple windows), session restore (reopen the last windows, tabs and folders; setting).
- A "This device" settings section for what exists on one system only (Secure Keyboard Entry, blur, Ctrl+C/V, Explorer menu).
- The command-finished signal from OSC 133 marks (start and end time per command), used by both notification items.
- New interface text in `shared/src/locales/en.json` and `hi.json` with the Hindi style guide; the language-file check runs in the tests.
- The self-test grows with each step (windows, the running-program check on Windows, command-line options), so CI keeps proving each platform.

## 3. Decisions for the owner

1. **Own version per platform** (suite rule, [Platform tags](https://github.com/kumasumit/ks-suite/blob/main/specs/versioning-signing.md)): `mac-vX.Y.Z` and `windows-vX.Y.Z` each release one system and are not marked latest; a plain `vX.Y.Z` still releases both. KS Forge checks for updates, so a plain **bridge release, `v0.2.0`** (new features, so MINOR), ships first with builds that already read the release list; each system's first own version is higher than that.
2. **Windows title bar**: (a) tabs in the title bar with our own caption buttons and Mica (more work, about 40 px more terminal); (b) keep the native title bar, only make it follow the dark or light theme.
3. **New dependencies** (each optional): `tauri-plugin-single-instance` (Windows second launch → new tab), `tauri-plugin-notification` (command finished, both), the `windows` crate for the jump list (Windows). Everything else uses what is already in the tree.
4. **macOS background blur**: needs Tauri's `macOSPrivateApi`, which Apple does not allow in the Mac App Store; fine for the dmg. Yes or no.
5. **More builds**: Intel Mac and Windows ARM64 (each one more CI job and release file), or Apple silicon and x64 only.
6. **Signing**: an Apple Developer ID (99 USD a year) for notarised dmgs, and a Windows code-signing certificate. Until then both stay unsigned.
7. **Windows hand check**: the owner tries the CI installer on a real Windows PC after the Windows step (start-up, speed, Narrator, title bar); it never blocks a release.

## 4. Build order and testing

Each step is one or more commits on `dev`, tested on its platform before the next. Releases follow the suite's release cycle.

| Step | What | Where | Tested on |
|---|---|---|---|
| 1 | Versioning per platform: updater on the release list (ks-utility v0.10.1 `releases_api_url`, `parse_releases`), release workflow for `mac-v` / `windows-v` / plain tags with a `platform` rehearsal input, the tag check (higher than its platform's tags and every plain tag), CHANGELOG headings `## [macOS X.Y.Z]` / `## [Windows X.Y.Z]`, then the bridge release `v0.2.0` | `shared/src-tauri/src/updates.rs`, `scripts/`, `.github/workflows/release.yml`, `specs/release.md` | Rust and script tests; a rehearsal per platform; v0.1.0 → v0.2.0 update by hand |
| 2 | Platform folders for Rust (`desktop/<os>/src/`), per-window state, multiple windows, session restore, "This device" settings | `shared/`, `desktop/*/src/` | Unit tests; self-test on macOS and on CI for Windows |
| 3 | macOS: menus and Dock menu, Finder services, drag and drop, Secure Keyboard Entry, Option keys, (blur), (notifications), VoiceOver | `desktop/mac/` | This Mac: self-test, the built dmg, VoiceOver |
| 4 | Windows: title bar (decision 2), Ctrl+C/V, running-program check, Explorer menu and command line, (single instance), (jump list), administrator profiles, start-up hint, Narrator mode | `desktop/windows/` | CI: unit tests, installer install/self-test/uninstall (checks the registry keys and the busy check); owner's hand check |
| 5 | Accessibility and Hindi pass on both | `shared/`, both folders | VoiceOver (Mac); Narrator by the owner |

**Built so far:**
- Step 1 (2026-11-25): the updater reads the release list and takes the newest release for its own system; the release workflow takes `vX.Y.Z` (both, latest), `mac-vX.Y.Z` and `windows-vX.Y.Z` (one system, not latest), checks each new tag is higher than the tags before it, and rehearses with a `platform` input. The bridge release is `v0.2.0`.
- Step 2 (2026-11-25): platform-only Rust in `desktop/mac/src/platform.rs` and `desktop/windows/src/platform.rs`; several windows (⌘N / Ctrl+Shift+N, Window › New Window), each with its own tabs, settings kept in step between them; Quit asks once for all windows, closing a window only for its own panes; session restore (`restoreSession`, on by default) reopens windows, tabs, splits, folders, titles and tab looks; `-d <folder>` and `-p <profile>` on the command line. Windows are shown at once with a dark background (a never-shown window sometimes did not load its page). Self-test: a second window opens and closes; the saved layout reads back. Session-per-window settings section ("This device") comes with the first item that needs it.
- Step 3, macOS (2026-11-25): menu bar with Shell, Edit, View and Window menus built from the interface's labels (English or Hindi) and the user's own shortcuts; Window menu lists the open windows; Dock menu (New Window, New Tab, each profile); Finder services "New KS Forge Tab/Window Here"; folders opened with the app or dropped on its Dock icon open a tab (Info.plist in `desktop/mac/`); Secure Keyboard Entry; left or right Option as Meta; background blur; files dropped on a pane type their quoted paths; "Starting …" hint. Tested on this Mac: self-test (Dock menu installed, running-program check, blur on and off), a folder opened with `open -a` became a tab, session restore brought the tabs back. The Finder services need the app in Applications to show up, so they were not tried by hand.
- Step 4, Windows (2026-11-25, CI only): tabs in the title bar with our own minimise, maximise and close buttons (no system title bar); Ctrl+C copies a selection and Ctrl+V pastes (settings); running-program check from the shell's child processes; "Open in KS Forge" on folders, folder backgrounds and drives (installer hooks); a second launch opens a tab (single instance); jump list with New window and each profile; "Run as administrator" profiles; WSL starts in `~`; PowerShell gets a command-start mark. Snap Layouts on hovering the maximise button are not done (needs native hit-testing of our button). Checked on CI by the installer test (registry keys) and the self-test (running-program check, jump list, process list).
- Both: notifications for long commands, screen reader mode (auto, on, off), reduced motion and high-contrast colours honoured, a "This device" settings section.
- Released as `v0.2.0` (2026-11-26), the plain bridge release for both systems: CI green on both (self-test of the built Mac app and of the installed Windows copy, including the second window, running-program check, jump list and Explorer menu), rehearsal green. Step 5's hand checks (VoiceOver, Narrator, a real Windows PC) are the owner's and come after the release.

Windows cannot be run from this Mac, so step 4 is checked by CI (the self-test drives the installed app) and the owner's hand check.
