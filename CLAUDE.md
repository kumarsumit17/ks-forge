# ks-forge

KS Forge: a fast, private terminal for macOS and Windows, with tabs, split panes, profiles, themes, a command palette and a settings screen and file. Part of KS-Suite; the suite-wide rules in the workspace `CLAUDE.md` apply.

## Stack
- Targets: `desktop/mac` (Apple silicon) and `desktop/windows` (x64, Windows 10 1809 or later). Other platform folders hold only a `.gitkeep`.
- **Rust + Tauri 2 + TypeScript/React**, the suite's second exception to the Kotlin rule, approved by the owner on 2026-11-24 (`specs/plan.md`). The Kotlin, Gradle and package-root rules do not apply. Bundle identifier: `com.ks.forge`.
- Terminal grid: xterm.js with its WebGL renderer. PTY on macOS and ConPTY on Windows through `portable-pty`. Interface: React with our own CSS (no UI kit) and Lucide icons.
- One Tauri codebase builds both systems, so it lives in `shared/` (`shared/src/` interface, `shared/src-tauri/` Rust). `desktop/mac/` and `desktop/windows/` hold only what is specific to one system: Tauri config overrides (added by `scripts/tauri.mjs`), the dmg script, the installer test, and platform-only Rust in `desktop/<os>/src/platform.rs`, compiled into the one crate through `#[path]` in `shared/src-tauri/src/lib.rs`.
- Toolchain: Rust 1.100 (`rust-toolchain.toml`), Node 26 / npm 11. Tauri 2.12, React 19.3, TypeScript 6.0, Vite 8.3, xterm.js 6.0.
- Version placeholder: `0.0.0` in `shared/src-tauri/Cargo.toml` (the Tauri CLI needs the field). Release builds write the tag's version with `scripts/set-version.mjs`.

## Commands
```bash
cd shared && npm install                 # first time
cd shared && npm run tauri dev           # run with hot reload
cd shared && npm run build               # type check + build the interface
cd shared && npm test                    # interface unit tests (node --test)
cd shared && npm run test:lang           # language files: ks-utility's check
node --test scripts/test/                # release scripts
cd shared/src-tauri && cargo test        # Rust tests
cd shared/src-tauri && cargo clippy --all-targets -- -D warnings
cd shared && npm run tauri build -- --bundles app      # macOS .app (nsis on Windows)
node scripts/selftest.mjs "shared/src-tauri/target/release/bundle/macos/KS Forge.app/Contents/MacOS/ks-forge"   # self-test
```

The self-test drives the real app (a shell, splits, tabs, themes, settings) and prints `KS_FORGE_SELFTEST PASS|FAIL ...`, with start-up and output-speed numbers; it uses a temporary settings folder. CI runs it on macOS and on the installed Windows copy.

## Specs
- All specs for this project live in `specs/` in the repository root, as an Open Knowledge Format (OKF) v0.2 bundle. Never create spec files anywhere else. Start at `specs/index.md`.
- One topic per file. Every file except `index.md` and `log.md` starts with YAML frontmatter: `type` (required: `Specification`, `Policy`, `Plan`, `Playbook` or `Reference`), `title`, `description` (one sentence), `tags`.
- When a spec is added: list it in `specs/index.md` with its description. When a spec is added or changed: add a line under today's date (`# YYYY-MM-DD`, newest first) in `specs/log.md`.
- Link between specs with relative markdown links.

## UI
- Interface text is English and Hindi: every string is a key in `shared/src/locales/{en,hi}.json` or ks-utility's `common.*` catalogue, used with `t()` from `shared/src/lib/i18n.ts`; Rust sends message codes (`msg!`), never sentences. Hindi follows ks-utility's `specs/hindi-style.md`; new terms are listed in `docs/hindi-review.md` for the owner.
- The design, themes and icon are our own. Never copy code, icons, themes, layouts or assets from other terminals (Wave, Warp, iTerm2, Windows Terminal, …).
- The window's colours come from the active terminal theme (`--bg`, `--fg`, `--accent` in `shared/src/styles.css`).

## Shared code (`ks-utility`)
- Pinned to one tag (`v0.9.0`), the same in `shared/package.json` (`git+https://github.com/kumarsumit17/ks-utility.git#<tag>`) and `shared/src-tauri/Cargo.toml` (`tag = "<tag>"`). Used for: translator and language check, app-update decisions (Rust), SHA-256, atomic writes, `formatBytes`.
- To move the pin: change both, `npm install`, `cargo check`, check both lock files name the tag's commit, commit both lock files in a commit of its own.

## Constraints
- Free: no ads, no analytics, no crash reporting.
- Network: only the app-update check (daily while "Check for updates automatically" is on, and on the button). Nothing about terminal content ever leaves the computer.
- Shell integration never edits the user's own startup files (`shared/src-tauri/src/integration.rs`).
- Speed claims only from measurements in `docs/benchmarks.md`.
- Dependencies: `specs/dependencies.md` before adding any crate or package; every one listed with its licence in `docs/THIRD_PARTY.md`.

## Working efficiently (keep token use low)
- Use the knowledge graph first: follow the rules in the `graphify` section at the end of this file. graphify is a development tool only; it is never a dependency of the app and is never bundled or shipped.
- Read only the specs the task needs, and do not re-read a file that has not changed in this session.
- Never read generated files: `node_modules/`, `dist/`, `shared/src-tauri/target/`, `shared/src-tauri/gen/`, `package-lock.json`, `Cargo.lock`, `graphify-out/graph.json`.
- Keep command output short (show only failures), and keep summaries brief.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- When graphify-out/graph.json exists, run `graphify query "<question>"` before your first grep, search or source-file read for a codebase question, and put this rule in every subagent prompt that explores code. Read raw files only for lines the graph or an earlier read already located. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. When the answer is under a Markdown heading, `graphify section "<heading>"` prints that section's text, so the .md need not be opened. These return a scoped subgraph, usually much smaller than GRAPH_REPORT
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
- `graphify-out/` is generated and git-ignored: never commit it.
