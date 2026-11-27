# Changelog

All notable changes to KS Forge. Versions follow [SemVer](https://semver.org/); the version comes from the git tag.

## [0.2.3] - 2026-11-27

- Updates open through ks-utility's installer: the download is marked as coming from the internet and opened; on macOS KS Forge says it now closes and quits after a few seconds (Finder cannot replace a running app), on Windows it quits as the installer starts. Your windows and tabs are saved first.
- Built with ks-utility v0.17.0; every release now runs ks-suite-check, and KS Forge moves to each new ks-utility by itself.

## [0.2.2] - 2026-11-27

- The Windows installer and uninstaller name KS Forge's own icon explicitly, so no build can fall back to a framework icon (KS-Suite "App icons" rule). A test checks every icon file and its sizes.

## [0.2.1] - 2026-11-26

- Built with ks-utility v0.14.0 and its shared Tauri release workflow (tag check, attestations and publishing). No change in the app itself.
- Attestations are now signed by ks-utility's publish workflow: `gh attestation verify <file> -R kumasumit/ks-forge --signer-workflow kumasumit/ks-utility/.github/workflows/tauri-app-release-publish.yml`.

## [0.2.0] - 2026-11-26

Each system's own build. This is also the bridge release: from here on macOS and Windows can release separately (`mac-v…`, `windows-v…`), and the app finds its own system's newest version.

**Install this version by hand once:** the project moved to github.com/kumasumit/ks-forge, and v0.1.0 only trusts downloads from the old address, so it cannot update itself to this version.

- Several windows (⌘N / Ctrl+Shift+N), each with its own tabs; Quit asks once about running programs.
- Windows, tabs, splits and folders come back at the next start (setting: Reopen windows and tabs).
- `-d <folder>` and `-p <profile>` on the command line.
- macOS: a full menu bar in English or Hindi that shows your own shortcuts; a Dock menu with New Window, New Tab and each profile; Finder services "New KS Forge Tab/Window Here"; folders opened with KS Forge or dropped on its Dock icon open a tab; Secure Keyboard Entry; left or right Option key as Meta.
- Windows: tabs in the title bar with the window buttons; Ctrl+C copies selected text and Ctrl+V pastes; closing a tab with a running program asks first; "Open in KS Forge" in File Explorer; a second launch opens a tab in the running app; a taskbar jump list with New window and each profile; "Run as administrator" profiles; WSL starts in your Linux home folder.
- Both: see-through background with blur; a notification when a long command finishes in the background; screen reader support (follows VoiceOver, Narrator or NVDA); files dropped on a pane type their paths; a "Starting …" hint while a shell starts; reduced motion and high-contrast colours honoured.
- Updates read the release list, so each system gets its own newest version.

## [0.1.0] - 2026-11-24

First release, for testing.

- Tabs: new, close, rename, duplicate, reorder by dragging, icon and colour per tab, middle-click to close.
- Split panes: right and down to any depth, draggable dividers, move focus and resize from the keyboard, zoom a pane, equal sizes.
- Profiles found on this computer (zsh, bash, fish; PowerShell, Windows PowerShell, Command Prompt, Git Bash, WSL), and your own, with folder, arguments, variables, icon, theme and shell integration.
- Ten built-in themes, following the system's light or dark look, theme import and export, accent colour.
- Fonts with ligatures, cursor style, line height, padding.
- Every shortcut changeable, with clashes shown; command palette.
- Find in scrollback, clickable links (Cmd-click / Ctrl-click), copy on select, right-click copy and paste, a warning before pasting several lines or `sudo`.
- Shell integration for zsh, bash, fish and PowerShell: folder for new tabs, jump between commands, failed commands marked.
- Settings screen and a live `settings.json`.
- English and Hindi.
- App updates through ks-utility's shared checker.
