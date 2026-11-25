# Third-party software

KS Forge uses these libraries directly. Each brings its own dependencies, under the same or similarly permissive licences (`cargo tree` and `npm ls` list them). No code, theme, icon or other asset is taken from another terminal.

## Rust (`shared/src-tauri/Cargo.toml`)

| Crate | Licence | Why |
|---|---|---|
| tauri, tauri-build | MIT OR Apache-2.0 | The desktop shell and system web view |
| portable-pty | MIT | PTY on macOS, ConPTY on Windows |
| arboard | MIT OR Apache-2.0 | System clipboard for Ctrl+Shift+C/V and the right-click menu |
| reqwest (rustls) | MIT OR Apache-2.0 | The app-update request and download |
| tokio, futures-util | MIT; MIT OR Apache-2.0 | Async I/O for the update download |
| serde, serde_json | MIT OR Apache-2.0 | Commands and the update state file |
| libc | MIT OR Apache-2.0 | Unix types (macOS) |
| tauri-plugin-notification | MIT OR Apache-2.0 | "Command finished" notifications |
| tauri-plugin-single-instance | MIT OR Apache-2.0 | Windows: a second launch opens a tab |
| windows | MIT OR Apache-2.0 | Windows: jump list, process list, administrator profiles |
| objc2, objc2-foundation, objc2-app-kit | MIT | macOS: Dock menu, Finder services, VoiceOver check |
| ks-utility | MIT | KS-Suite's shared helpers (first-party) |

## Interface (`shared/package.json`)

| Package | Licence | Why |
|---|---|---|
| @xterm/xterm and its addons (webgl, fit, search, web-links, unicode11) | MIT | The terminal grid, drawn on the GPU |
| @tauri-apps/api, @tauri-apps/plugin-notification | Apache-2.0 OR MIT | Calls into Rust; notifications |
| react, react-dom | MIT | The interface |
| lucide-react | ISC | Icons |
| ks-utility | MIT | Translator, language check, app-update store, byte formatting (first-party) |

Build tools only (not shipped): @tauri-apps/cli, Vite, @vitejs/plugin-react, TypeScript (MIT / Apache-2.0).
