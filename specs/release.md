---
type: Playbook
title: Releasing
description: This app's release files, checks and steps within the suite's release cycle.
tags: [release, ci, macos, windows]
---

# Releasing

The suite's [release cycle](https://github.com/kumasumit/KS-Suite/blob/main/specs/release-cycle.md) applies; `.github/workflows/release.yml` follows its shape (rehearsal by manual run, read-only build jobs, one publish job, attestations, pinned actions). The shared `kotlin-app-release.yml` in ks-utility is for Gradle apps only; a shared Tauri workflow there is a later step.

## Tags

Each system has its own version (KS-Suite [Platform tags](https://github.com/kumasumit/KS-Suite/blob/main/specs/versioning-signing.md)):

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

## Steps

GitHub starts a workflow by hand only when its file is on the default branch, so for the very first release `main` was fast-forwarded to a green `dev` before the rehearsal (2026-11-24); from then on the order below holds.

1. On `dev`: CI green; date the version's CHANGELOG section; run **Release** by hand with the version (rehearsal) and check it is green.
2. Fast-forward `main` to `dev`, push, CI green on `main`.
3. `git tag -a <tag> -m "<tag>"` on `main`, `git push origin <tag>`.
4. The workflow publishes the release (marked latest for a plain tag only).
