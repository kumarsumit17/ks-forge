# 2026-11-27

* **Update**: `v0.2.3` released on ks-utility v0.18.4 (updates through ks-utility's installer, ks-suite-check, workflows at `@main`, the bump workflow on `main`).
* **Update**: ks-utility pin moved to v0.18.4 (today's last tag, the owner's "fresh release on latest ks-utility").
* **Update**: ks-utility pin moved to v0.18.3 (bump workflow and Kotlin build fixes; nothing KS Forge uses changed).
* **Update**: ks-utility pin moved to v0.18.1 (a fix to its bump workflow).
* **Update**: ks-utility v0.18.0: pin moved; the release and bump workflows call ks-utility's shared workflows at `@main` (owner's decision: no `@vX` refs to move).
* **Update**: owner's decision: no `KS_WORKFLOWS_TOKEN`; the bump workflow no longer passes it. The calls of ks-utility's workflows move to `@main` once ks-utility's check accepts it.
* **Update**: ks-utility v0.17.0: pin and workflow calls moved; the macOS update result is `macos-closes`, so the shared update store shows that KS Forge now closes; the quit waits `MAC_QUIT_AFTER_MS`.
* **Update**: ks-utility v0.16.0: pin and the `@vX` calls of its shared workflows moved; the bump workflow passes `KS_WORKFLOWS_TOKEN` so automatic moves rewrite those calls too.
* **Update**: ks-utility v0.15.0: pin moved; updates open with `app_update::install::open` (macOS quits after 6 s, Windows at once, session saved first); `ks-utility-bump.yml` added; the release check (`@v0.15.0`) runs ks-suite-check. [Releasing](release.md) updated.
* **Update**: `v0.2.2` released (installer icon named explicitly; icon test).
* **Update**: [Releasing](release.md): icons audited for the suite's "App icons" rule: all our own (no Tauri default); the NSIS installer icon is now named explicitly; an icon test added.
* **Update**: `v0.2.1` released, the first release through ks-utility's shared Tauri workflows; both files verified with `--signer-workflow`.
* **Update**: links to the suite repository now use its new name, `kumasumit/ks-suite`.

# 2026-11-26

* **Update**: ks-utility pin moved to v0.14.0; [Releasing](release.md): the release workflow calls ks-utility's shared Tauri check and publish workflows (attestations signed by ks-utility's publish workflow).
* **Update**: `v0.2.0` released (bridge release, both systems); [Per-platform optimization plan](plan-per-platform.md) marked.
* **Update**: ks-utility pin moved to v0.13.2 (approved Hindi terms only, no code change); [Releasing](release.md): the pin moves to ks-utility's newest tag before each release.
* **Update**: [Releasing](release.md): "Build, test, release, no waiting" (owner's suite rule): tested work is released with the next tag without asking first; hand checks never block a release.
* **Update**: ks-utility pin moved to v0.12.1 (पैनल is no longer an avoided word; it stays right for a panel, and a terminal pane is हिस्सा). No change to KS Forge's texts.
* **Update**: ks-utility pin moved to v0.12.0 (approved Hindi terms; v0.11 added the google-tv and chrome platforms; no code KS Forge uses changed).
* **Update**: Hindi: the owner approved KS Forge's terms (ks-utility v0.12.0) with Pane as हिस्सा instead of पैनल; 13 texts and the landing-page tagline changed; `docs/hindi-review.md` removed.
* **Update**: the repository moved to `kumasumit/ks-forge` (owner's account move): git remote, links, the updater's repository and the release notes' attestation command. v0.1.0 copies only trust files from the old address, so they get v0.2.0 by hand once ([Releasing](release.md)).
* **Update**: ks-utility and KS-Suite moved to the GitHub account `kumasumit` (owner confirmed): the ks-utility git dependencies (npm, Cargo, both lock files; same v0.10.1 commit `c1a7afb`) and the links to both. KS Forge itself stays under `kumarsumit17` until it moves.

# 2026-11-25

* **Update**: [Per-platform optimization plan](plan-per-platform.md) and [Releasing](release.md): platform tags again (suite rule changed by the owner): `mac-vX.Y.Z` and `windows-vX.Y.Z` release one system and are not latest; plain `vX.Y.Z` releases both; `v0.2.0` is the bridge release; the updater reads the release list; step 1 built.
* **Update**: ks-utility pin moved to v0.10.1 (no code changes since v0.10.0; adds KS Forge's 13 Hindi terms to the term list, marked owner review).
* **Update**: [Per-platform optimization plan](plan-per-platform.md): versioning follows the suite rule (one `vX.Y.Z` for both builds); the platform-tag option and bridge release are removed; the description now says one version for both builds, each tuned to its OS.
* **Update**: [Per-platform optimization plan](plan-per-platform.md) steps 3 (macOS) and 4 (Windows) built; [Settings file](settings-file.md): `optionAsMeta`, `secureKeyboardEntry`, `ctrlCCopies`, `ctrlVPastes`, `backgroundBlur`, `backgroundOpacity`, `notifyLongCommands`, `screenReaderMode`, `runAsAdmin`; [Dependencies](dependencies.md): tauri-plugin-notification, tauri-plugin-single-instance (Windows), windows (Windows), objc2 crates (macOS), all but the plugins already in the tree.
* **Update**: [Per-platform optimization plan](plan-per-platform.md) step 2 built: several windows, session restore, command-line folder and profile, platform-only Rust in the platform folders. [Settings file](settings-file.md): `restoreSession`.
* **Update**: [Per-platform optimization plan](plan-per-platform.md) approved: one version for both, tabs in the Windows title bar, single instance + notifications + jump list, macOS background blur; Apple silicon and x64 only, unsigned for now.
* **Creation**: [Per-platform optimization plan](plan-per-platform.md) added (draft, waiting for the owner's approval and decisions): audit of the macOS and Windows builds, per-platform items, seven decisions, build order with tests.
* **Update**: `ks-utility` moved from `v0.4.2` to `v0.9.0` (more languages, the translation tools; [ks-utility translation tools](https://github.com/kumasumit/ks-utility/blob/main/specs/translating.md)).

# 2026-11-25

* **Update**: [Releasing](release.md): `ks-suite.json`, the app's card on the KS-Suite landing page, added on `dev`; it reaches `main` with the next release.

# 2026-11-24

* **Update**: [Releasing](release.md): the first rehearsal needed the release workflow on `main`, so `main` was fast-forwarded to a green `dev` first.
* **Creation**: [Dependencies](dependencies.md), [Settings file](settings-file.md) and [Releasing](release.md) added with the v0.1.0 build. Dependencies added: tauri, portable-pty, arboard, reqwest (rustls), tokio, futures-util, serde, serde_json, libc, ks-utility v0.4.2 (now v0.9.0); xterm.js 6 with the webgl, fit, search, web-links and unicode11 addons, React, lucide-react, @tauri-apps/api.
* **Update**: [First version plan](plan.md): steps 3 to 5 done; decisions taken while building (own ligature joiner, no window transparency yet, no session restore yet, the self-test).
* **Update**: [First version plan](plan.md): approved by the owner, including the Rust/Tauri exception to the suite's Kotlin rule.
* **Update**: [First version plan](plan.md): the owner chose the name KS Forge (`ks-forge`, `com.ks.forge`); the folder is renamed from `ks-terminal`.
* **Creation**: [First version plan](plan.md) added (draft, waiting for the owner's choice of name and approval of the stack exception).
