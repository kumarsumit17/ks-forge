---
type: Playbook
title: Releasing
description: This app's release files, checks and steps within the suite's release cycle.
tags: [release, ci, macos, windows]
---

# Releasing

The suite's [release cycle](https://github.com/kumasumit/ks-suite/blob/main/specs/release-cycle.md) applies. `.github/workflows/release.yml` calls ks-utility's shared Tauri workflows ([Tauri apps](https://github.com/kumasumit/ks-utility/blob/main/specs/release-workflow.md)): `tauri-app-release-check.yml` (tag format, higher than earlier tags, on `main`, dated CHANGELOG section) before our own macOS and Windows build jobs, and `tauri-app-release-publish.yml` (attest, check, publish) after them. Since v0.2.1 attestations are signed by that publish workflow: `gh attestation verify <file> -R kumasumit/ks-forge --signer-workflow kumasumit/ks-utility/.github/workflows/tauri-app-release-publish.yml`.

## Tags

Each system has its own version (KS-Suite [Platform tags](https://github.com/kumasumit/ks-suite/blob/main/specs/versioning-signing.md)):

| Tag | Builds | Marked latest | CHANGELOG heading |
|---|---|---|---|
| `vX.Y.Z` | macOS and Windows | yes | `## [X.Y.Z] - YYYY-MM-DD` |
| `mac-vX.Y.Z` | macOS only | no | `## [macOS X.Y.Z] - YYYY-MM-DD` |
| `windows-vX.Y.Z` | Windows only | no | `## [Windows X.Y.Z] - YYYY-MM-DD` |

A new tag must be higher than its system's own tags and every plain tag (a plain tag: higher than every tag); the workflow checks this before building. The app's updater reads the release list and takes the newest release for its system, so a release that is not "latest" still reaches it. `v0.2.0` is the bridge release: plain, both systems, the first whose builds read the release list (v0.1.0 reads only `releases/latest`). A rehearsal takes the version and `platform` (`all`, `mac`, `windows`).

## Files

| System | File | Built on |
|---|---|---|
| macOS (Apple silicon) | `ks-forge-v<version>-macos-arm64.dmg` (plain and `mac-v` tags) | `macos-15` |
| Windows (x64) | `ks-forge-v<version>-windows-x64-setup.exe` (NSIS, per user, no admin; plain and `windows-v` tags) | `windows-2025` |

These names match ks-utility's [app-update](https://github.com/kumasumit/ks-utility/blob/main/specs/app-update.md) rules, so the app finds its own update.

## Checks before publishing
- The tag is `vX.Y.Z`, `mac-vX.Y.Z` or `windows-vX.Y.Z` on `main`, higher than the tags before it; `CHANGELOG.md` has its dated section.
- Unit tests, Rust tests and the language check on both systems.
- macOS: the app's version is the tag's, the signature verifies, and the **self-test** passes on the built app.
- Windows: the installer installs silently, the **self-test** passes on the installed copy, and it uninstalls cleanly.
- Exactly the tag's files (two for a plain tag, one for a platform tag), unchanged between jobs (SHA-256), each with a build provenance attestation.

## The 2026-11-26 account move

The repository moved from `kumarsumit17/ks-forge` to `kumasumit/ks-forge`. GitHub forwards the old API address, but a v0.1.0 copy accepts only files under `https://github.com/kumarsumit17/ks-forge/releases/download/`, so it reports no installer for v0.2.0: v0.1.0 users install v0.2.0 by hand once (the release notes say so). From v0.2.0 on, the app reads the new address.

## Landing page card

`ks-suite.json` in the repository root is this app's card on the KS-Suite landing page, read from `main` (the released app). It reaches `main` with each release; change it on `dev` when the platforms or description change.

## Signing
- Not yet signed by Apple (ad hoc signature, no notarisation) or Microsoft (no Authenticode); the release notes say how to open the files the first time. Real signing needs an Apple Developer ID and a Windows code-signing certificate from the owner.
- The four `ks-release` secrets are set on the repository (suite rule "signing first", 2026-11-24); this desktop-only app does not use them yet.

## Build, test, release, no waiting

The owner's rule for every KS-Suite app ([release cycle](https://github.com/kumasumit/ks-suite/blob/main/specs/release-cycle.md)): every feature or fix is built, tested (unit tests, the self-test on macOS and on CI's installed Windows copy), pushed to `dev` and released with the next tag, with no approval asked before a tag. Nothing is committed or released while a test fails. A feature raises MINOR, a fix raises PATCH. The owner's hand checks on a real Mac or Windows PC come after the release and never block one; what they find goes into the next version.

## Steps

0. Move the ks-utility pin to its newest tag first, in a commit of its own, tested as usual (suite rule, [release cycle](https://github.com/kumasumit/ks-suite/blob/main/specs/release-cycle.md) step 1).

GitHub starts a workflow by hand only when its file is on the default branch, so for the very first release `main` was fast-forwarded to a green `dev` before the rehearsal (2026-11-24); from then on the order below holds.

1. On `dev`: CI green; date the version's CHANGELOG section; run **Release** by hand with the version (rehearsal) and check it is green.
2. Fast-forward `main` to `dev`, push, CI green on `main`.
3. `git tag -a <tag> -m "<tag>"` on `main`, `git push origin <tag>`.
4. The workflow publishes the release (marked latest for a plain tag only).
