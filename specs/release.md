---
type: Playbook
title: Releasing
description: This app's release files, checks and steps within the suite's release cycle.
tags: [release, ci, macos, windows]
---

# Releasing

The suite's [release cycle](https://github.com/kumarsumit17/KS-Suite/blob/main/specs/release-cycle.md) applies; `.github/workflows/release.yml` follows its shape (rehearsal by manual run, read-only build jobs, one publish job, attestations, pinned actions). The shared `kotlin-app-release.yml` in ks-utility is for Gradle apps only; a shared Tauri workflow there is a later step.

## Files

| System | File | Built on |
|---|---|---|
| macOS (Apple silicon) | `ks-forge-v<version>-macos-arm64.dmg` | `macos-15` |
| Windows (x64) | `ks-forge-v<version>-windows-x64-setup.exe` (NSIS, per user, no admin) | `windows-2025` |

These names match ks-utility's [app-update](https://github.com/kumarsumit17/ks-utility/blob/main/specs/app-update.md) rules, so the app finds its own update.

## Checks before publishing
- The tag is `vX.Y.Z` on `main`; `CHANGELOG.md` has a dated `## [X.Y.Z] - YYYY-MM-DD` section.
- Unit tests, Rust tests and the language check on both systems.
- macOS: the app's version is the tag's, the signature verifies, and the **self-test** passes on the built app.
- Windows: the installer installs silently, the **self-test** passes on the installed copy, and it uninstalls cleanly.
- Exactly the two files, unchanged between jobs (SHA-256), each with a build provenance attestation.

## Landing page card

`ks-suite.json` in the repository root is this app's card on the KS-Suite landing page, read from `main` (the released app). It reaches `main` with each release; change it on `dev` when the platforms or description change.

## Signing
- Not yet signed by Apple (ad hoc signature, no notarisation) or Microsoft (no Authenticode); the release notes say how to open the files the first time. Real signing needs an Apple Developer ID and a Windows code-signing certificate from the owner.
- The four `ks-release` secrets are set on the repository (suite rule "signing first", 2026-11-24); this desktop-only app does not use them yet.

## Steps

GitHub starts a workflow by hand only when its file is on the default branch, so for the very first release `main` was fast-forwarded to a green `dev` before the rehearsal (2026-11-24); from then on the order below holds.

1. On `dev`: CI green; date the version's CHANGELOG section; run **Release** by hand with the version (rehearsal) and check it is green.
2. Fast-forward `main` to `dev`, push, CI green on `main`.
3. `git tag -a vX.Y.Z -m "vX.Y.Z"` on `main`, `git push origin vX.Y.Z`.
4. The workflow publishes the release, marked latest.
