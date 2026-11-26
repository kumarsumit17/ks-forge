---
type: Policy
title: Dependencies
description: The suite's minimum-dependency rule for this Rust and TypeScript app, and why each direct dependency is needed.
tags: [dependencies, cargo, npm, policy]
---

# Dependencies

The suite rule ([Dependencies](https://github.com/kumasumit/ks-suite/blob/main/specs/dependencies.md)) applies: add a dependency only when writing it ourselves would be unreasonable or unsafe; standard library and our own code first; security-critical code (TLS) from a maintained library; no analytics, crash-reporting or ad SDKs. Every dependency is listed with its licence in `docs/THIRD_PARTY.md` and recorded in [log](log.md) when added.

## Why each one

| Dependency | Why we do not write it |
|---|---|
| Tauri | The desktop shell and system web view; the suite's Rust/Tauri exception |
| portable-pty | PTY and ConPTY differ deeply per system (fork/exec and termios on macOS, ConPTY and pipes on Windows); a maintained crate is safer |
| xterm.js + webgl, fit, search, web-links, unicode11 addons | A full VT parser and a GPU renderer are years of work. The ligatures addon is **not** used: it needs Node to read font files; ligatures come from our own character joiner (`shared/src/lib/text.ts`) |
| arboard | The system clipboard from Rust on both systems (the web view cannot read the clipboard without asking) |
| reqwest with rustls, tokio, futures-util | TLS must come from a maintained library; the same stack as ks-download-manager |
| serde, serde_json | Already brought by Tauri |
| tauri-plugin-notification | "Command finished" notifications on both systems (owner's decision 3, 2026-11-25) |
| tauri-plugin-single-instance (Windows) | A second launch (Explorer, jump list, shortcut) opens a tab in the running app (decision 3) |
| windows (Windows) | Jump list (COM), process list for the running-program check, `ShellExecute` for administrator profiles, the screen-reader flag; already in the tree through Tauri |
| objc2, objc2-foundation, objc2-app-kit (macOS) | Dock menu, Finder services, VoiceOver check; already in the tree through Tauri |
| React, lucide-react | The suite's interface stack; Lucide icons are imported one by one so only those used are bundled |

No UI kit, state library, router or test framework: our own CSS, a small store (`shared/src/lib/app.ts`), and Node's built-in test runner.
