# 2026-11-25

* **Update**: ks-utility pin moved to v0.10.1 (no code changes since v0.10.0; adds KS Forge's 13 Hindi terms to the term list, marked owner review).
* **Update**: [Per-platform optimization plan](plan-per-platform.md): versioning follows the suite rule (one `vX.Y.Z` for both builds); the platform-tag option and bridge release are removed; the description now says one version for both builds, each tuned to its OS.
* **Update**: [Per-platform optimization plan](plan-per-platform.md) steps 3 (macOS) and 4 (Windows) built; [Settings file](settings-file.md): `optionAsMeta`, `secureKeyboardEntry`, `ctrlCCopies`, `ctrlVPastes`, `backgroundBlur`, `backgroundOpacity`, `notifyLongCommands`, `screenReaderMode`, `runAsAdmin`; [Dependencies](dependencies.md): tauri-plugin-notification, tauri-plugin-single-instance (Windows), windows (Windows), objc2 crates (macOS), all but the plugins already in the tree.
* **Update**: [Per-platform optimization plan](plan-per-platform.md) step 2 built: several windows, session restore, command-line folder and profile, platform-only Rust in the platform folders. [Settings file](settings-file.md): `restoreSession`.
* **Update**: [Per-platform optimization plan](plan-per-platform.md) approved: one version for both, tabs in the Windows title bar, single instance + notifications + jump list, macOS background blur; Apple silicon and x64 only, unsigned for now.
* **Creation**: [Per-platform optimization plan](plan-per-platform.md) added (draft, waiting for the owner's approval and decisions): audit of the macOS and Windows builds, per-platform items, seven decisions, build order with tests.
* **Update**: `ks-utility` moved from `v0.4.2` to `v0.9.0` (more languages, the translation tools; [ks-utility translation tools](https://github.com/kumarsumit17/ks-utility/blob/main/specs/translating.md)).

# 2026-11-25

* **Update**: [Releasing](release.md): `ks-suite.json`, the app's card on the KS-Suite landing page, added on `dev`; it reaches `main` with the next release.

# 2026-11-24

* **Update**: [Releasing](release.md): the first rehearsal needed the release workflow on `main`, so `main` was fast-forwarded to a green `dev` first.
* **Creation**: [Dependencies](dependencies.md), [Settings file](settings-file.md) and [Releasing](release.md) added with the v0.1.0 build. Dependencies added: tauri, portable-pty, arboard, reqwest (rustls), tokio, futures-util, serde, serde_json, libc, ks-utility v0.4.2 (now v0.9.0); xterm.js 6 with the webgl, fit, search, web-links and unicode11 addons, React, lucide-react, @tauri-apps/api.
* **Update**: [First version plan](plan.md): steps 3 to 5 done; decisions taken while building (own ligature joiner, no window transparency yet, no session restore yet, the self-test).
* **Update**: [First version plan](plan.md): approved by the owner, including the Rust/Tauri exception to the suite's Kotlin rule.
* **Update**: [First version plan](plan.md): the owner chose the name KS Forge (`ks-forge`, `com.ks.forge`); the folder is renamed from `ks-terminal`.
* **Creation**: [First version plan](plan.md) added (draft, waiting for the owner's choice of name and approval of the stack exception).
